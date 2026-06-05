/**
 * Redact known secret patterns from log/stderr text before writing to disk.
 *
 * Applied to child-process stderr in proxy-host.ts and gateway-host.ts so that
 * a misbehaving MCP server that prints its token or credentials to stderr does
 * not persist those values in host.log.
 */

type RedactRule = [pattern: RegExp, replacement: string];

const RULES: RedactRule[] = [
  // Hoolix auth keys (mcp_<48 hex chars>)
  [/\b(mcp_[a-f0-9]{32,})\b/g, 'mcp_<redacted>'],
  // GitHub tokens
  [/\b(ghp_[A-Za-z0-9_]{36,})\b/g, 'ghp_<redacted>'],
  [/\b(github_pat_[A-Za-z0-9_]{40,})\b/g, 'github_pat_<redacted>'],
  [/\b(ghs_[A-Za-z0-9]{36,})\b/g, 'ghs_<redacted>'],
  // Generic API keys / secrets
  [/\b(sk-[A-Za-z0-9]{20,})\b/g, 'sk-<redacted>'],
  // HTTP Authorization headers in log text
  [/(Authorization:\s*)([^\s"',\n\r]+)/gi, '$1<redacted>'],
  [/(Bearer\s+)([^\s"',\n\r]{8,})/gi, '$1<redacted>'],
  // KEY=value or key: value patterns in env dumps
  [/\b((?:token|key|secret|password|passwd|credential|api[_-]?key)[=:]\s*['"]?)([^'"\s,\n\r]{4,})(['"]?)/gi, '$1<redacted>$3'],
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const [pattern, replacement] of RULES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
