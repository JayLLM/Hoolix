import { describe, it, expect } from 'vitest';
import { evaluatePolicy, matchesPattern, isWriteTool } from '../src/core/policy.js';
import type { Profile } from '../src/core/profiles.js';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  const now = new Date().toISOString();
  return {
    name: 'test',
    slug: 'test',
    authKey: 'mcp_' + 'a'.repeat(48),
    allowedGateways: [],
    allowedTools: ['*'],
    approvalMode: 'writes',
    policy: { defaultEffect: 'allow', rules: [] },
    sandbox: { filesystemRoots: [], blockedPaths: [], allowedDomains: [], blockedDomains: [] },
    createdAt: now,
    lastUpdatedAt: now,
    ...overrides,
  };
}

describe('matchesPattern', () => {
  it('matches exact names', () => {
    expect(matchesPattern('search_docs', 'search_docs')).toBe(true);
  });

  it('wildcard * matches anything', () => {
    expect(matchesPattern('*', 'any_tool')).toBe(true);
    expect(matchesPattern('read_*', 'read_file')).toBe(true);
    expect(matchesPattern('read_*', 'write_file')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesPattern('Search_Docs', 'search_docs')).toBe(true);
  });
});

describe('isWriteTool', () => {
  const writeCases = [
    'create_file', 'file_create', 'update_record', 'write_output',
    'delete_server', 'remove_item', 'send_message', 'post_data',
    'push_changes', 'merge_branch', 'mutate_state', 'insert_row',
    'edit_config', 'apply_patch',
  ];
  for (const tool of writeCases) {
    it(`classifies "${tool}" as write`, () => {
      expect(isWriteTool(tool)).toBe(true);
    });
  }

  const readCases = ['search_docs', 'list_files', 'get_info', 'read_resource'];
  for (const tool of readCases) {
    it(`classifies "${tool}" as non-write`, () => {
      expect(isWriteTool(tool)).toBe(false);
    });
  }
});

describe('evaluatePolicy', () => {
  it('allows everything when profile is null', () => {
    const result = evaluatePolicy({ profile: null, gateway: 'gw', toolName: 'anything', args: {} });
    expect(result.effect).toBe('allow');
  });

  it('denies when gateway is not in allowedGateways', () => {
    const profile = makeProfile({ allowedGateways: ['production'] });
    const result = evaluatePolicy({ profile, gateway: 'staging', toolName: 'read_docs', args: {} });
    expect(result.effect).toBe('deny');
    expect(result.reason).toContain('gateway');
  });

  it('allows when gateway matches allowedGateways', () => {
    const profile = makeProfile({ allowedGateways: ['production'] });
    const result = evaluatePolicy({ profile, gateway: 'production', toolName: 'read_docs', args: {} });
    expect(result.effect).toBe('allow');
  });

  it('allows when allowedGateways is empty (no restriction)', () => {
    const profile = makeProfile({ allowedGateways: [] });
    const result = evaluatePolicy({ profile, gateway: 'any-gateway', toolName: 'read_docs', args: {} });
    expect(result.effect).toBe('allow');
  });

  it('denies when tool is not in allowedTools', () => {
    const profile = makeProfile({ allowedTools: ['search_*'] });
    const result = evaluatePolicy({ profile, gateway: 'gw', toolName: 'write_file', args: {} });
    expect(result.effect).toBe('deny');
    expect(result.reason).toContain('tool');
  });

  it('allows when tool matches allowedTools wildcard', () => {
    const profile = makeProfile({ allowedTools: ['search_*', 'read_*'] });
    const result = evaluatePolicy({ profile, gateway: 'gw', toolName: 'search_docs', args: {} });
    expect(result.effect).toBe('allow');
  });

  it('denies when filesystem arg matches a blockedPath', () => {
    const profile = makeProfile({
      sandbox: {
        filesystemRoots: [],
        blockedPaths: ['/etc/passwd'],
        allowedDomains: [],
        blockedDomains: [],
      },
    });
    const result = evaluatePolicy({
      profile,
      gateway: 'gw',
      toolName: 'read_file',
      args: { path: '/etc/passwd' },
    });
    expect(result.effect).toBe('deny');
    expect(result.reason).toContain('blocked path');
  });

  it('denies when URL domain is in blockedDomains', () => {
    const profile = makeProfile({
      sandbox: {
        filesystemRoots: [],
        blockedPaths: [],
        allowedDomains: [],
        blockedDomains: ['evil.example.com'],
      },
    });
    const result = evaluatePolicy({
      profile,
      gateway: 'gw',
      toolName: 'fetch_url',
      args: { url: 'https://evil.example.com/data' },
    });
    expect(result.effect).toBe('deny');
    expect(result.reason).toContain('blocked domain');
  });

  it('denies when URL domain is not in allowedDomains (allow-list mode)', () => {
    const profile = makeProfile({
      sandbox: {
        filesystemRoots: [],
        blockedPaths: [],
        allowedDomains: ['docs.example.com'],
        blockedDomains: [],
      },
    });
    const result = evaluatePolicy({
      profile,
      gateway: 'gw',
      toolName: 'fetch_url',
      args: { url: 'https://other.example.com/' },
    });
    expect(result.effect).toBe('deny');
    expect(result.reason).toContain('outside allowed');
  });

  it('policy rule match returns the rule effect', () => {
    const profile = makeProfile({
      policy: {
        defaultEffect: 'allow',
        rules: [{ match: 'dangerous_*', effect: 'deny' }],
      },
    });
    const result = evaluatePolicy({ profile, gateway: 'gw', toolName: 'dangerous_exec', args: {} });
    expect(result.effect).toBe('deny');
  });

  it('policy rule allows before default-deny', () => {
    const profile = makeProfile({
      policy: {
        defaultEffect: 'deny',
        rules: [{ match: 'search_docs', effect: 'allow' }],
      },
    });
    const result = evaluatePolicy({ profile, gateway: 'gw', toolName: 'search_docs', args: {} });
    expect(result.effect).toBe('allow');
  });

  it('approvalMode=always returns approve for any tool', () => {
    const profile = makeProfile({ approvalMode: 'always' });
    const result = evaluatePolicy({ profile, gateway: 'gw', toolName: 'read_docs', args: {} });
    expect(result.effect).toBe('approve');
  });

  it('approvalMode=read-only denies write tools', () => {
    const profile = makeProfile({ approvalMode: 'read-only' });
    const result = evaluatePolicy({ profile, gateway: 'gw', toolName: 'create_file', args: {} });
    expect(result.effect).toBe('deny');
  });

  it('approvalMode=read-only allows read tools', () => {
    const profile = makeProfile({ approvalMode: 'read-only' });
    const result = evaluatePolicy({ profile, gateway: 'gw', toolName: 'search_docs', args: {} });
    expect(result.effect).toBe('allow');
  });

  it('approvalMode=writes returns approve for write tools', () => {
    const profile = makeProfile({ approvalMode: 'writes' });
    const result = evaluatePolicy({ profile, gateway: 'gw', toolName: 'create_file', args: {} });
    expect(result.effect).toBe('approve');
  });

  it('approvalMode=writes allows read tools via default', () => {
    const profile = makeProfile({ approvalMode: 'writes', policy: { defaultEffect: 'allow', rules: [] } });
    const result = evaluatePolicy({ profile, gateway: 'gw', toolName: 'search_docs', args: {} });
    expect(result.effect).toBe('allow');
  });

  it('returns default policy effect when no rules match', () => {
    const profile = makeProfile({ policy: { defaultEffect: 'deny', rules: [] } });
    const result = evaluatePolicy({ profile, gateway: 'gw', toolName: 'unknown_tool', args: {} });
    expect(result.effect).toBe('deny');
  });
});
