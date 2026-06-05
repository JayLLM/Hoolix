/**
 * SSRF guard unit tests.
 *
 * These tests do NOT use vi.mock so they run correctly under both vitest and
 * Bun's native test runner (which does not support vitest's hoisting transformer).
 *
 * DNS-resolution tests are covered via a real loopback HTTP server: if asserting
 * that DNS resolves to a private IP is needed, the bare-IP cases already cover
 * that path because isPrivateIp() is called once before DNS and again after.
 */
import { describe, it, expect } from 'vitest';
import { isPrivateIp, assertSafeFetchTarget } from '../src/lib/safeFetch.js';

// ── isPrivateIp ───────────────────────────────────────────────────────────────

describe('isPrivateIp', () => {
  const privateIps = [
    '127.0.0.1', '127.255.255.255',
    '10.0.0.0', '10.1.2.3', '10.255.255.255',
    '172.16.0.0', '172.20.0.1', '172.31.255.255',
    '192.168.0.1', '192.168.100.200',
    '169.254.0.1', '169.254.169.254',
    '100.64.0.0', '100.100.0.1',
    '0.0.0.0',
    '::1',
    'fc00::1', 'fd12:3456::1',
    'fe80::1',
    '::',
  ];
  for (const ip of privateIps) {
    it(`blocks ${ip}`, () => {
      expect(isPrivateIp(ip)).toBe(true);
    });
  }

  const publicIps = [
    '8.8.8.8', '1.1.1.1', '93.184.216.34',
    '203.0.113.1', '198.51.100.0',
    '172.15.0.1', '172.32.0.1', // just outside RFC1918 Class B
    '192.169.0.1',
  ];
  for (const ip of publicIps) {
    it(`allows ${ip}`, () => {
      expect(isPrivateIp(ip)).toBe(false);
    });
  }
});

// ── assertSafeFetchTarget (static / non-DNS cases) ────────────────────────────

describe('assertSafeFetchTarget', () => {
  // All tests below resolve without real DNS because the targets are either
  // blocked before lookup (scheme/hostname/bare IP) or use a valid public URL
  // whose DNS lookup may be skipped/fail non-fatally per the guard's contract.

  it('rejects ftp:// scheme', async () => {
    await expect(assertSafeFetchTarget('ftp://example.com/file')).rejects.toThrow('blocked scheme');
  });

  it('rejects file:// scheme', async () => {
    await expect(assertSafeFetchTarget('file:///etc/passwd')).rejects.toThrow('blocked scheme');
  });

  it('rejects blocked hostname: localhost', async () => {
    await expect(assertSafeFetchTarget('http://localhost/api')).rejects.toThrow('blocked hostname');
  });

  it('rejects blocked hostname: 169.254.169.254 (AWS IMDSv1)', async () => {
    await expect(assertSafeFetchTarget('http://169.254.169.254/latest/meta-data')).rejects.toThrow();
  });

  it('rejects blocked hostname: metadata.google.internal', async () => {
    await expect(assertSafeFetchTarget('http://metadata.google.internal/')).rejects.toThrow('blocked hostname');
  });

  it('rejects blocked hostname: metadata.azure.com', async () => {
    await expect(assertSafeFetchTarget('http://metadata.azure.com/')).rejects.toThrow('blocked hostname');
  });

  it('rejects blocked hostname: ip6-localhost', async () => {
    await expect(assertSafeFetchTarget('http://ip6-localhost/')).rejects.toThrow('blocked hostname');
  });

  it('rejects bare private IPv4: 192.168.1.1', async () => {
    await expect(assertSafeFetchTarget('http://192.168.1.1/data')).rejects.toThrow('blocked private IP');
  });

  it('rejects bare private IPv4: 10.0.0.1', async () => {
    await expect(assertSafeFetchTarget('http://10.0.0.1/data')).rejects.toThrow('blocked private IP');
  });

  it('rejects bare private IPv4: 127.0.0.1', async () => {
    await expect(assertSafeFetchTarget('http://127.0.0.1/data')).rejects.toThrow('blocked private IP');
  });

  it('rejects bare private IPv4: 172.16.0.1', async () => {
    await expect(assertSafeFetchTarget('http://172.16.0.1/data')).rejects.toThrow('blocked private IP');
  });

  it('rejects bare private IPv6 loopback: ::1', async () => {
    await expect(assertSafeFetchTarget('http://[::1]/data')).rejects.toThrow();
  });

  it('rejects bare link-local: 169.254.100.1', async () => {
    await expect(assertSafeFetchTarget('http://169.254.100.1/')).rejects.toThrow('blocked private IP');
  });

  it('strips trailing dot from hostname before checking', async () => {
    await expect(assertSafeFetchTarget('http://localhost./api')).rejects.toThrow('blocked hostname');
  });

  it('rejects invalid URL', async () => {
    await expect(assertSafeFetchTarget('not a url')).rejects.toThrow('invalid URL');
  });

  it('rejects unspecified address 0.0.0.0', async () => {
    await expect(assertSafeFetchTarget('http://0.0.0.0/')).rejects.toThrow('blocked private IP');
  });
});
