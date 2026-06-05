import { describe, it, expect } from 'vitest';
import { interpolateString, interpolateRunConfig } from '../src/app/services/credentials.js';

describe('interpolateString', () => {
  it('replaces a single placeholder', () => {
    expect(interpolateString('Hello {name}!', { name: 'world' })).toBe('Hello world!');
  });

  it('replaces multiple placeholders in one pass', () => {
    expect(interpolateString('{a} and {b}', { a: 'foo', b: 'bar' })).toBe('foo and bar');
  });

  it('leaves unknown placeholders as literal text', () => {
    expect(interpolateString('prefix_{missing}_suffix', {})).toBe('prefix_{missing}_suffix');
  });

  it('returns the template unchanged when there are no placeholders', () => {
    expect(interpolateString('no placeholders here', { key: 'val' })).toBe('no placeholders here');
  });

  it('handles empty template', () => {
    expect(interpolateString('', { key: 'val' })).toBe('');
  });

  it('preserves shell metacharacters verbatim in the substituted value', () => {
    // Injected value with shell metacharacters must not be interpreted specially —
    // command construction is always array-based, never shell-concatenated.
    const malicious = '; rm -rf /';
    expect(interpolateString('{token}', { token: malicious })).toBe(malicious);
  });

  it('preserves backticks and dollar signs verbatim', () => {
    const val = '`echo pwned`$HOME';
    expect(interpolateString('{val}', { val })).toBe(val);
  });

  it('replaces the same key multiple times', () => {
    expect(interpolateString('{k}/{k}', { k: 'x' })).toBe('x/x');
  });
});

describe('interpolateRunConfig', () => {
  it('substitutes placeholders in args', () => {
    const result = interpolateRunConfig(
      { command: 'node', args: ['--token', '{TOKEN}'], env: {} },
      { TOKEN: 'secret123' },
    );
    expect(result.args).toEqual(['--token', 'secret123']);
  });

  it('substitutes placeholders in env values', () => {
    const result = interpolateRunConfig(
      { command: 'node', args: [], env: { API_KEY: '{KEY}' } },
      { KEY: 'abc' },
    );
    expect(result.env['API_KEY']).toBe('abc');
  });

  it('does not interpolate the command name', () => {
    const result = interpolateRunConfig(
      { command: '{should-not-change}', args: [], env: {} },
      { 'should-not-change': 'malicious' },
    );
    // command is not interpolated — it is taken as-is
    expect(result.command).toBe('{should-not-change}');
  });

  it('leaves unknown placeholders in args unchanged', () => {
    const result = interpolateRunConfig(
      { command: 'node', args: ['{UNKNOWN}'], env: {} },
      {},
    );
    expect(result.args).toEqual(['{UNKNOWN}']);
  });

  it('env keys are preserved verbatim (not interpolated)', () => {
    const result = interpolateRunConfig(
      { command: 'node', args: [], env: { '{KEY}': 'val' } },
      { KEY: 'replacement' },
    );
    // env key names are passed through unchanged
    expect(Object.keys(result.env)).toContain('{KEY}');
  });

  it('handles an empty substitution map', () => {
    const result = interpolateRunConfig(
      { command: 'node', args: ['--port', '{PORT}'], env: { X: '{Y}' } },
      {},
    );
    expect(result.args).toEqual(['--port', '{PORT}']);
    expect(result.env['X']).toBe('{Y}');
  });
});
