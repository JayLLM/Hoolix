/**
 * SSRF-safe fetch helpers.
 *
 * Every outbound HTTP request made during ingestion or self-update must go through
 * assertSafeFetchTarget() before the first connection attempt and after every redirect.
 * This prevents the fetcher from being used to probe internal services, cloud metadata
 * endpoints, or loopback addresses via a malicious docs URL.
 */

import { promises as dns } from 'node:dns';

const PRIVATE_IP_PATTERNS = [
  /^127\./,                           // IPv4 loopback
  /^10\./,                            // RFC 1918 Class A
  /^172\.(1[6-9]|2\d|3[01])\./,       // RFC 1918 Class B
  /^192\.168\./,                       // RFC 1918 Class C
  /^169\.254\./,                       // Link-local / AWS IMDSv1
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // RFC 6598 carrier-grade NAT
  /^0\.0\.0\.0$/,                     // Unspecified
  /^::1$/,                             // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,                 // IPv6 unique local fc00::/7
  /^fd[0-9a-f]{2}:/i,                 // IPv6 unique local fd00::/8
  /^fe80:/i,                           // IPv6 link-local
  /^::$/,                              // IPv6 unspecified
];

const BLOCKED_HOSTNAMES = new Set([
  '169.254.169.254',           // AWS IMDSv1
  'metadata.google.internal',  // GCP metadata
  'metadata.azure.com',        // Azure IMDS
  'metadata.azure.internal',
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
]);

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((re) => re.test(ip));
}

/**
 * Validates that a URL is safe to fetch from an SSRF perspective.
 * Rejects non-http/https schemes, blocked hostnames, and IPs that resolve to
 * private/internal ranges.
 *
 * Set MCP_PORTAL_DISABLE_SSRF_GUARD=1 to bypass all checks (test environments only).
 *
 * @throws Error if the target is blocked.
 */
export async function assertSafeFetchTarget(urlStr: string): Promise<void> {
  // Test-only escape hatch — never set this in production deployments.
  if (process.env.MCP_PORTAL_DISABLE_SSRF_GUARD === '1') return;
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`SSRF guard: invalid URL "${urlStr}"`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`SSRF guard: blocked scheme "${parsed.protocol}" — only http/https allowed`);
  }

  // Strip trailing dot (DNS FQDN) and IPv6 brackets so isPrivateIp patterns match.
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`SSRF guard: blocked hostname "${hostname}"`);
  }

  // Reject bare IPs that are in private ranges without DNS lookup
  if (isPrivateIp(hostname)) {
    throw new Error(`SSRF guard: blocked private IP "${hostname}"`);
  }

  // Resolve DNS and verify each resulting address
  try {
    const results = await dns.lookup(hostname, { all: true });
    for (const { address } of results) {
      if (isPrivateIp(address)) {
        throw new Error(
          `SSRF guard: "${hostname}" resolves to private/internal IP "${address}" — blocked`,
        );
      }
    }
  } catch (err: any) {
    if ((err.message as string).startsWith('SSRF guard:')) throw err;
    // DNS resolution failures are non-fatal here — the actual fetch will fail with a clearer error.
  }
}

/**
 * Returns the resolved URL after one redirect step, or null if the response is not a redirect.
 * Used to check redirect targets before following them.
 */
export function getRedirectTarget(response: Response): string | null {
  if (response.status >= 300 && response.status < 400) {
    return response.headers.get('location');
  }
  return null;
}
