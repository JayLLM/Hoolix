/**
 * Updater unit tests.
 *
 * These tests do NOT use vi.stubGlobal / vi.mock so they run correctly under
 * both vitest and Bun's native test runner (which does not support vitest's
 * hoisting transformer). fetch is intercepted via a real local HTTP server.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { createHash } from 'node:crypto';
import { compareVersions, verifyChecksum } from '../src/core/updater.js';

// ── compareVersions ───────────────────────────────────────────────────────────

describe('compareVersions', () => {
  const cases: [string, string, number][] = [
    // equal
    ['1.0.0', '1.0.0', 0],
    ['0.0.1', '0.0.1', 0],
    // newer left
    ['2.0.0', '1.9.9', 1],
    ['1.1.0', '1.0.9', 1],
    ['1.0.1', '1.0.0', 1],
    // older left
    ['0.9.9', '1.0.0', -1],
    ['1.0.0', '1.0.1', -1],
    // prerelease — stable > prerelease of same version
    ['1.0.0', '1.0.0-beta.1', 1],
    ['1.0.0-beta.2', '1.0.0-beta.1', 1],
    ['1.0.0-alpha', '1.0.0-beta', -1],
    // v prefix stripped
    ['v1.2.3', 'v1.2.2', 1],
    ['v0.0.4', 'v0.0.4', 0],
  ];

  for (const [a, b, expected] of cases) {
    const sign = expected === 0 ? '==' : expected > 0 ? '>' : '<';
    it(`${a} ${sign} ${b}`, () => {
      const result = compareVersions(a, b);
      if (expected === 0) expect(result).toBe(0);
      else if (expected > 0) expect(result).toBeGreaterThan(0);
      else expect(result).toBeLessThan(0);
    });
  }
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** Spin up a tiny HTTP server that serves one response body then shuts down. */
async function withChecksumServer(
  statusCode: number,
  body: string,
  fn: (url: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer((_req, res) => {
    res.writeHead(statusCode, { 'content-type': 'text/plain' });
    res.end(body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}/SHA256SUMS`;
  try {
    await fn(url);
  } finally {
    server.close();
    await once(server, 'close').catch(() => {});
  }
}

// ── verifyChecksum ────────────────────────────────────────────────────────────

describe('verifyChecksum (fail-closed behaviour)', () => {
  let tmpDir: string;
  let binPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hoolix-checksum-'));
    binPath = path.join(tmpDir, 'test-binary');
    await fs.writeFile(binPath, 'fake binary content');
    // Allow the local fixture server to bypass the SSRF guard.
    process.env.MCP_PORTAL_DISABLE_SSRF_GUARD = '1';
  });

  afterEach(async () => {
    delete process.env.MCP_PORTAL_DISABLE_SSRF_GUARD;
    await fs.remove(tmpDir).catch(() => {});
  });

  it('returns {ok:false, verified:false} when checksumUrl is undefined', async () => {
    const result = await verifyChecksum(binPath, 'test-binary', undefined);
    expect(result).toEqual({ ok: false, verified: false });
  });

  it('returns {ok:false, verified:false} when checksum fetch returns 404', async () => {
    await withChecksumServer(404, 'not found', async (url) => {
      const result = await verifyChecksum(binPath, 'test-binary', url);
      expect(result).toEqual({ ok: false, verified: false });
    });
  });

  it('returns {ok:false, verified:false} when asset name not in SHA256SUMS', async () => {
    await withChecksumServer(200, 'abc123def456  other-binary\n', async (url) => {
      const result = await verifyChecksum(binPath, 'test-binary', url);
      expect(result).toEqual({ ok: false, verified: false });
    });
  });

  it('returns {ok:true, verified:true} when hash matches', async () => {
    const data = await fs.readFile(binPath);
    const expectedHash = createHash('sha256').update(data).digest('hex');
    await withChecksumServer(200, `${expectedHash}  test-binary\n`, async (url) => {
      const result = await verifyChecksum(binPath, 'test-binary', url);
      expect(result).toEqual({ ok: true, verified: true });
    });
  });

  it('returns {ok:false, verified:true} when hash does not match', async () => {
    const wrongHash = 'a'.repeat(64);
    await withChecksumServer(200, `${wrongHash}  test-binary\n`, async (url) => {
      const result = await verifyChecksum(binPath, 'test-binary', url);
      expect(result).toEqual({ ok: false, verified: true });
    });
  });
});
