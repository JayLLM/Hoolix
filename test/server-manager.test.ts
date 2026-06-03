import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { buildHostSpawnPlan, ServerManager } from '../src/process/manager.js';
import { resetPathsForTests } from '../src/core/paths.js';
import { makeTempDataDir } from './helpers/e2e.js';

describe('buildHostSpawnPlan', () => {
  it('uses the dev tsx binary path on Unix when running under node/bun and tsx exists', () => {
    const plan = buildHostSpawnPlan({
      slug: 'docs',
      port: 3456,
      dataDir: '/tmp/data',
      authKey: 'mcp_key',
      execPath: '/usr/bin/node',
      platform: 'linux',
      cwd: '/repo',
      tsxExists: true,
    });

    expect(plan.mode).toBe('dev-tsx-bin');
    expect(plan.command).toBe(path.resolve('/repo/node_modules/.bin/tsx'));
    expect(plan.args).toEqual([
      path.resolve('/repo/src/mcp/host.ts'),
      '--slug', 'docs',
      '--port', '3456',
      '--data-dir', '/tmp/data',
      '--auth-key', 'mcp_key',
    ]);
  });

  it('uses node --import tsx on Windows dev runs to avoid .cmd spawn issues', () => {
    const plan = buildHostSpawnPlan({
      slug: 'docs',
      port: 3456,
      dataDir: 'C:/tmp/data',
      authKey: 'mcp_key',
      execPath: 'C:/Program Files/nodejs/node.exe',
      platform: 'win32',
      cwd: 'C:/repo',
      tsxExists: true,
    });

    expect(plan.mode).toBe('dev-node-import');
    expect(plan.command).toBe('C:/Program Files/nodejs/node.exe');
    expect(plan.args.slice(0, 3)).toEqual(['--import', 'tsx', path.resolve('C:/repo/src/mcp/host.ts')]);
  });

  it('falls back to node --import tsx when the local tsx binary is unavailable', () => {
    const plan = buildHostSpawnPlan({
      slug: 'docs',
      port: 3456,
      dataDir: '/tmp/data',
      authKey: 'mcp_key',
      execPath: '/usr/bin/node',
      platform: 'linux',
      cwd: '/repo',
      tsxExists: false,
    });

    expect(plan.mode).toBe('dev-node-import');
    expect(plan.command).toBe('/usr/bin/node');
    expect(plan.args.slice(0, 3)).toEqual(['--import', 'tsx', path.resolve('/repo/src/mcp/host.ts')]);
  });

  it('uses binary self-spawn with __internal-host for compiled executables', () => {
    const plan = buildHostSpawnPlan({
      slug: 'docs',
      port: 4567,
      dataDir: 'C:/data/docs',
      authKey: 'mcp_key',
      execPath: 'C:/Users/Alice/bin/hoolix.exe',
      platform: 'win32',
      cwd: 'C:/repo',
      tsxExists: true,
    });

    expect(plan.mode).toBe('binary');
    expect(plan.command).toBe('C:/Users/Alice/bin/hoolix.exe');
    expect(plan.args).toEqual([
      '__internal-host',
      '--slug', 'docs',
      '--port', '4567',
      '--data-dir', 'C:/data/docs',
      '--auth-key', 'mcp_key',
    ]);
  });
});

describe('ServerManager status cleanup', () => {
  let dataDir = '';

  beforeEach(async () => {
    dataDir = makeTempDataDir('hoolix-manager-');
    process.env.MCP_PORTAL_DATA_DIR = dataDir;
    resetPathsForTests();
    await fs.ensureDir(path.join(dataDir, 'servers', 'stale'));
  });

  afterEach(async () => {
    delete process.env.MCP_PORTAL_DATA_DIR;
    resetPathsForTests();
    await fs.remove(dataDir).catch(() => {});
  });

  it('removes stale runtime markers when the recorded process is gone', async () => {
    const runtimePath = path.join(dataDir, 'servers', 'stale', '.runtime.json');
    await fs.writeJson(runtimePath, {
      pid: 987654321,
      port: 3456,
      startedAt: new Date().toISOString(),
      status: 'running',
    });

    const manager = new ServerManager();
    const status = await manager.getStatus('stale');

    expect(status.running).toBe(false);
    expect(await fs.pathExists(runtimePath)).toBe(false);
  });
});
