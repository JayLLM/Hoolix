import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:dns so tests never make real DNS requests.
vi.mock('node:dns', () => ({
  promises: {
    lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
  },
}));

import { promises as dns } from 'node:dns';
import { isPrivateIp, assertSafeFetchTarget } from '../src/lib/safeFetch.js';

const mockLookup = dns.lookup as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

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

describe('assertSafeFetchTarget', () => {
  it('allows a public https URL', async () => {
    await expect(assertSafeFetchTarget('https://example.com/docs')).resolves.toBeUndefined();
  });

  it('allows a public http URL', async () => {
    await expect(assertSafeFetchTarget('http://example.com/docs')).resolves.toBeUndefined();
  });

  it('rejects ftp:// scheme', async () => {
    await expect(assertSafeFetchTarget('ftp://example.com/file')).rejects.toThrow('blocked scheme');
  });

  it('rejects file:// scheme', async () => {
    await expect(assertSafeFetchTarget('file:///etc/passwd')).rejects.toThrow('blocked scheme');
  });

  it('rejects javascript: scheme', async () => {
    await expect(assertSafeFetchTarget('javascript:alert(1)')).rejects.toThrow();
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

  it('rejects bare private IPv4: 192.168.1.1', async () => {
    await expect(assertSafeFetchTarget('http://192.168.1.1/data')).rejects.toThrow('blocked private IP');
  });

  it('rejects bare private IPv4: 10.0.0.1', async () => {
    await expect(assertSafeFetchTarget('http://10.0.0.1/data')).rejects.toThrow('blocked private IP');
  });

  it('rejects bare private IPv4: 127.0.0.1', async () => {
    await expect(assertSafeFetchTarget('http://127.0.0.1/data')).rejects.toThrow('blocked private IP');
  });

  it('rejects when DNS resolves to a private IP', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
    await expect(assertSafeFetchTarget('https://evil.example.com/')).rejects.toThrow('private/internal IP');
  });

  it('rejects when DNS resolves to loopback', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await expect(assertSafeFetchTarget('https://redir.example.com/')).rejects.toThrow('private/internal IP');
  });

  it('allows when DNS resolves to a public IP', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    await expect(assertSafeFetchTarget('https://example.com/')).resolves.toBeUndefined();
  });

  it('strips trailing dot from hostname before checking', async () => {
    // localhost. with trailing dot should still be blocked
    await expect(assertSafeFetchTarget('http://localhost./api')).rejects.toThrow('blocked hostname');
  });

  it('rejects invalid URL', async () => {
    await expect(assertSafeFetchTarget('not a url')).rejects.toThrow('invalid URL');
  });
});
