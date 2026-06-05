import { describe, it, expect } from 'vitest';
import { timingSafeEqualString, generateAuthKey } from '../src/lib/auth.js';

describe('timingSafeEqualString', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqualString('mcp_abc', 'mcp_abc')).toBe(true);
  });

  it('returns false for strings that differ by one character', () => {
    expect(timingSafeEqualString('mcp_abc', 'mcp_abd')).toBe(false);
  });

  it('returns false when lengths differ', () => {
    expect(timingSafeEqualString('short', 'longer')).toBe(false);
    expect(timingSafeEqualString('longer', 'short')).toBe(false);
  });

  it('returns false for empty vs non-empty', () => {
    expect(timingSafeEqualString('', 'a')).toBe(false);
    expect(timingSafeEqualString('a', '')).toBe(false);
  });

  it('returns true for two empty strings', () => {
    expect(timingSafeEqualString('', '')).toBe(true);
  });

  it('is case-sensitive', () => {
    expect(timingSafeEqualString('ABC', 'abc')).toBe(false);
  });

  it('handles multi-byte unicode correctly', () => {
    const u1 = 'mcp_ékey';
    const u2 = 'mcp_ékey';
    const u3 = 'mcp_ekey';
    expect(timingSafeEqualString(u1, u2)).toBe(true);
    expect(timingSafeEqualString(u1, u3)).toBe(false);
  });

  it('handles a realistic 52-char mcp_ token', () => {
    const token = 'mcp_' + 'a'.repeat(48);
    expect(timingSafeEqualString(token, token)).toBe(true);
    expect(timingSafeEqualString(token, token.slice(0, -1) + 'b')).toBe(false);
  });
});

describe('generateAuthKey', () => {
  it('generates a string prefixed with mcp_', () => {
    const key = generateAuthKey();
    expect(key.startsWith('mcp_')).toBe(true);
  });

  it('generates a key of at least 52 characters', () => {
    const key = generateAuthKey();
    expect(key.length).toBeGreaterThanOrEqual(52);
  });

  it('generates unique keys on successive calls', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateAuthKey()));
    expect(keys.size).toBe(20);
  });

  it('hex suffix is lowercase hex only', () => {
    const key = generateAuthKey();
    const suffix = key.slice('mcp_'.length);
    expect(/^[a-f0-9]+$/.test(suffix)).toBe(true);
  });
});
