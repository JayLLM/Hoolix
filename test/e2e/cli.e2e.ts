import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { getFreePort, runCli, startDocsFixtureServer, withTempPortalData } from '../helpers/e2e.js';

const SLUG = 'e2e-fixture-docs';

describe('CLI e2e (tsx + isolated MCP_PORTAL_DATA_DIR)', () => {
  it('creates, verifies, connects, rotates, exercises TUI test keys, starts host, and cleans up', async () => {
    const fixture = await startDocsFixtureServer();
    try {
      await withTempPortalData(async (dataDir) => {
        const env = { MCP_PORTAL_DATA_DIR: dataDir };
        const hostPort = await getFreePort();

        const created = await runCli(['create', 'E2E Fixture Docs', '--url', fixture.url, '--yes'], { env, timeoutMs: 60_000 });
        expect(created.code, created.combined).toBe(0);
        expect(created.combined).toContain('created successfully');
        expect(created.combined).toContain(`hoolix start ${SLUG}`);

        const serverDir = path.join(dataDir, 'servers', SLUG);
        const metadataPath = path.join(serverDir, 'metadata.json');
        const chunksPath = path.join(serverDir, 'data', 'chunks.json');
        expect(await fs.pathExists(metadataPath)).toBe(true);
        expect(await fs.pathExists(chunksPath)).toBe(true);
        const beforeRotate = await fs.readJson(metadataPath);
        expect(beforeRotate.sourceUrl).toBe(fixture.url);
        expect(beforeRotate.chunkCount).toBeGreaterThan(0);

        const verified = await runCli(['verify', SLUG, '--json'], { env });
        expect(verified.code, verified.combined).toBe(0);
        const verifyJson = JSON.parse(verified.stdout.slice(verified.stdout.indexOf('{')));
        expect(verifyJson.slug).toBe(SLUG);
        expect(verifyJson.searchable).toBe(true);
        expect(verifyJson.groundingPercent).toBeGreaterThan(0);
        expect(verifyJson.samples.length).toBeGreaterThan(0);

        const connected = await runCli(['connect', SLUG, '--client', 'generic', '--json', '--port', String(hostPort)], { env });
        expect(connected.code, connected.combined).toBe(0);
        const connectJson = JSON.parse(connected.stdout.slice(connected.stdout.indexOf('{')));
        expect(connectJson.mcpServers[SLUG].type).toBe('streamable-http');
        expect(connectJson.mcpServers[SLUG].headers.Authorization).toContain(beforeRotate.authKey);

        const rotated = await runCli(['rotate', SLUG, '--yes'], { env });
        expect(rotated.code, rotated.combined).toBe(0);
        expect(rotated.combined).toContain('Key rotated');
        const afterRotate = await fs.readJson(metadataPath);
        expect(afterRotate.authKey).not.toBe(beforeRotate.authKey);

        const tui = await runCli(['tui'], {
          env: { ...env, MCP_PORTAL_TUI_TEST_MODE: '1', MCP_PORTAL_TUI_KEYS: 'v,c,q', CI: '' },
        });
        expect(tui.code, tui.combined).toBe(0);
        expect(tui.combined).toContain('hoolix TUI');
        expect(tui.combined).toContain(SLUG);
        expect(tui.combined).toContain('MCP config for');

        const started = await runCli(['start', SLUG, '--port', String(hostPort)], { env, timeoutMs: 30_000 });
        expect(started.code, started.combined).toBe(0);
        expect(started.combined).toContain('Running');
        expect(started.combined).toContain(`http://127.0.0.1:${hostPort}/mcp`);
        expect(await fs.pathExists(path.join(serverDir, '.runtime.json'))).toBe(true);

        const health = await fetch(`http://127.0.0.1:${hostPort}/health`);
        expect(health.ok).toBe(true);

        const stopped = await runCli(['stop', SLUG], { env });
        expect(stopped.code, stopped.combined).toBe(0);
        expect(stopped.combined).toContain('Stopped');

        const deleted = await runCli(['delete', SLUG, '--yes'], { env });
        expect(deleted.code, deleted.combined).toBe(0);
        expect(await fs.pathExists(serverDir)).toBe(false);
      });
    } finally {
      await fixture.close();
    }
  }, 120_000);
});
