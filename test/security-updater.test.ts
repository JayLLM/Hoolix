import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// ── verifyChecksum ────────────────────────────────────────────────────────────

describe('verifyChecksum (fail-closed behaviour)', () => {
  let tmpDir: string;
  let binPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hoolix-checksum-'));
    binPath = path.join(tmpDir, 'test-binary');
    await fs.writeFile(binPath, 'fake binary content');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tmpDir).catch(() => {});
  });

  it('returns {ok:false, verified:false} when checksumUrl is undefined', async () => {
    const result = await verifyChecksum(binPath, 'test-binary', undefined);
    expect(result).toEqual({ ok: false, verified: false });
  });

  it('returns {ok:false, verified:false} when checksum fetch returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await verifyChecksum(binPath, 'test-binary', 'https://example.com/SHA256SUMS');
    expect(result).toEqual({ ok: false, verified: false });
  });

  it('returns {ok:false, verified:false} when asset name not in SHA256SUMS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'abc123def456  other-binary\n',
    }));
    const result = await verifyChecksum(binPath, 'test-binary', 'https://example.com/SHA256SUMS');
    expect(result).toEqual({ ok: false, verified: false });
  });

  it('returns {ok:true, verified:true} when hash matches', async () => {
    const data = await fs.readFile(binPath);
    const expectedHash = createHash('sha256').update(data).digest('hex');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `${expectedHash}  test-binary\n`,
    }));
    const result = await verifyChecksum(binPath, 'test-binary', 'https://example.com/SHA256SUMS');
    expect(result).toEqual({ ok: true, verified: true });
  });

  it('returns {ok:false, verified:true} when hash does not match', async () => {
    const wrongHash = 'a'.repeat(64);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `${wrongHash}  test-binary\n`,
    }));
    const result = await verifyChecksum(binPath, 'test-binary', 'https://example.com/SHA256SUMS');
    expect(result).toEqual({ ok: false, verified: true });
  });

  it('returns {ok:false, verified:false} when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network timeout')));
    const result = await verifyChecksum(binPath, 'test-binary', 'https://example.com/SHA256SUMS');
    expect(result).toEqual({ ok: false, verified: false });
  });
});
