import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../src/lib/logRedact.js';

describe('redactSecrets', () => {
  it('redacts hoolix mcp_ auth keys', () => {
    const line = 'starting server with auth mcp_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
    const out = redactSecrets(line);
    expect(out).not.toContain('mcp_a1b2c3d4');
    expect(out).toContain('mcp_<redacted>');
  });

  it('redacts GitHub personal access tokens (ghp_)', () => {
    // bare ghp_ token (no key= prefix) → matched by the ghp_ rule
    const line = 'received ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij from client';
    const out = redactSecrets(line);
    expect(out).not.toContain('ghp_ABCDEF');
    expect(out).toContain('ghp_<redacted>');
  });

  it('redacts GitHub tokens embedded in key=value pairs', () => {
    // The key=value rule fires first for "token=ghp_..." — result is redacted either way
    const line = 'token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const out = redactSecrets(line);
    expect(out).not.toContain('ghp_ABCDEF');
    expect(out).toContain('<redacted>');
  });

  it('redacts GitHub PAT (github_pat_)', () => {
    const line = 'github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv';
    const out = redactSecrets(line);
    expect(out).not.toContain('github_pat_ABCDEF');
    expect(out).toContain('github_pat_<redacted>');
  });

  it('redacts OpenAI-style sk- API keys', () => {
    const line = 'api_key is sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
    const out = redactSecrets(line);
    expect(out).not.toContain('sk-aBcDeFgH');
    expect(out).toContain('sk-<redacted>');
  });

  it('redacts Authorization header values', () => {
    const line = 'Authorization: mcp_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
    const out = redactSecrets(line);
    expect(out).toContain('Authorization:');
    expect(out).toContain('<redacted>');
    expect(out).not.toContain('mcp_a1b2c3d4');
  });

  it('redacts Bearer token in log line', () => {
    const line = 'received Bearer mcp_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6 from client';
    const out = redactSecrets(line);
    expect(out).toContain('Bearer');
    expect(out).toContain('<redacted>');
    expect(out).not.toContain('mcp_a1b2c3d4');
  });

  it('redacts key=value credential patterns', () => {
    const cases = [
      'token=abc1234567',
      'password=mysecret99',
      'api_key=AKIAIOSFODNN7EXAMPLE',
      'SECRET=XYZABCDEF12345',
    ];
    for (const line of cases) {
      const out = redactSecrets(line);
      expect(out).toContain('<redacted>');
      expect(out).not.toBe(line);
    }
  });

  it('does not alter text with no secrets', () => {
    const clean = 'INFO server started on port 3456';
    expect(redactSecrets(clean)).toBe(clean);
  });

  it('redacts multiple secrets in the same line', () => {
    const line =
      'token=sk-ABCDEFGHIJKLMNOPQRST password=hunter2 key=mcp_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
    const out = redactSecrets(line);
    expect(out).not.toContain('sk-ABCDEF');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('mcp_a1b2');
  });

  it('handles empty string', () => {
    expect(redactSecrets('')).toBe('');
  });
});
