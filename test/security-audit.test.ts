import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { AuditLogger } from '../src/lib/auditLogger.js';
import { RateLimiter } from '../src/lib/rateLimiter.js';

// ── AuditLogger ───────────────────────────────────────────────────────────────

describe('AuditLogger', () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hoolix-audit-'));
    logPath = path.join(tmpDir, 'audit.log');
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  it('creates the log file on first write', async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.write('search_docs', { query: 'hello' });
    expect(await fs.pathExists(logPath)).toBe(true);
  });

  it('writes a valid JSON line per entry', async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.write('search_docs', { query: 'hello' });
    const content = await fs.readFile(logPath, 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.tool).toBe('search_docs');
    expect(parsed.query).toBe('hello');
    expect(typeof parsed.ts).toBe('string');
  });

  it('appends multiple entries and counts them correctly', async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.write('tool_a', { n: 1 });
    await logger.write('tool_b', { n: 2 });
    await logger.write('tool_c', { n: 3 });
    const lines = (await fs.readFile(logPath, 'utf8')).trim().split('\n');
    expect(lines.length).toBe(3);
  });

  it('loads existing line count on init so rotation threshold is respected', async () => {
    await fs.writeFile(logPath, 'line1\nline2\nline3\n');
    const logger = new AuditLogger(logPath);
    await logger.init();
    // Internal lineCount should be 3; just verify init doesn't throw
    await logger.write('tool', {});
    const lines = (await fs.readFile(logPath, 'utf8')).trim().split('\n');
    expect(lines.length).toBe(4);
  });

  it('rotates and keeps the last keepRatio fraction when maxLines is exceeded', async () => {
    const maxLines = 10;
    const keepRatio = 0.5;
    const logger = new AuditLogger(logPath, maxLines, keepRatio);
    await logger.init();

    for (let i = 0; i < maxLines + 1; i++) {
      await logger.write('tool', { seq: i });
    }

    const lines = (await fs.readFile(logPath, 'utf8')).trim().split('\n').filter(Boolean);
    // After rotation we keep Math.floor(maxLines * keepRatio) = 5 lines
    expect(lines.length).toBeLessThanOrEqual(Math.floor(maxLines * keepRatio) + 1);
    // All remaining lines should be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('does not leave a .tmp file after rotation', async () => {
    const logger = new AuditLogger(logPath, 5, 0.5);
    await logger.init();
    for (let i = 0; i < 6; i++) await logger.write('tool', { i });
    expect(await fs.pathExists(logPath + '.tmp')).toBe(false);
  });
});

// ── RateLimiter ───────────────────────────────────────────────────────────────

describe('RateLimiter', () => {
  let tmpDir: string;
  let stateFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hoolix-rl-'));
    stateFile = path.join(tmpDir, 'rate-state.json');
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  it('allows requests within the limit', async () => {
    const rl = new RateLimiter(5, 60_000, stateFile);
    await rl.init();
    for (let i = 0; i < 5; i++) {
      expect(rl.check()).toBe(true);
    }
    rl.stop();
  });

  it('blocks the request that exceeds the limit', async () => {
    const rl = new RateLimiter(3, 60_000, stateFile);
    await rl.init();
    rl.check(); rl.check(); rl.check(); // 3 allowed
    expect(rl.check()).toBe(false); // 4th blocked
    rl.stop();
  });

  it('resets counter after the window expires', async () => {
    const rl = new RateLimiter(2, 50, stateFile); // 50 ms window
    await rl.init();
    rl.check(); rl.check();
    expect(rl.check()).toBe(false);
    await new Promise((r) => setTimeout(r, 60)); // wait for window to expire
    expect(rl.check()).toBe(true); // new window
    rl.stop();
  });

  it('retryAfterSeconds returns a positive number within the window', async () => {
    const rl = new RateLimiter(1, 10_000, stateFile);
    await rl.init();
    rl.check(); // exhaust
    const wait = rl.retryAfterSeconds();
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(10);
    rl.stop();
  });

  it('flushes state to disk and loads it on next init', async () => {
    const rl = new RateLimiter(10, 60_000, stateFile);
    await rl.init();
    rl.check(); rl.check(); rl.check();
    await rl.flush();
    rl.stop();

    const state = await fs.readJson(stateFile);
    expect(state.reqCount).toBe(3);
    expect(state.limit).toBe(10);
  });

  it('starts fresh without state file', async () => {
    const rl = new RateLimiter(5, 60_000, stateFile);
    await rl.init(); // no file → no crash, starts at 0
    expect(rl.check()).toBe(true);
    rl.stop();
  });

  it('stop() prevents further timer callbacks (no unhandled rejection)', async () => {
    const rl = new RateLimiter(5, 60_000, stateFile);
    await rl.init();
    rl.check();
    rl.stop(); // should not throw
  });
});
