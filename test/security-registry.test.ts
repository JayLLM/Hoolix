import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { makeTempDataDir } from './helpers/e2e.js';
import { resetPathsForTests } from '../src/core/paths.js';
import {
  registerServer,
  getServerMetadata,
  METADATA_SCHEMA_VERSION,
} from '../src/core/registry.js';
import { generateAuthKey } from '../src/lib/auth.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function baseServerInput() {
  return {
    name: 'Test Server',
    slug: 'test-server',
    sourceUrl: 'https://example.com/docs',
    sourceType: 'generic' as const,
    authKey: generateAuthKey(),
    chunkCount: 0,
    vectorIndexed: false,
    serverKind: 'docs-rag' as const,
    credentialKeys: [],
    ingestionVersion: '1.0.0',
    embeddingModel: 'fuse' as const,
  };
}

let dataDir = '';

beforeEach(async () => {
  dataDir = makeTempDataDir('hoolix-registry-');
  process.env.MCP_PORTAL_DATA_DIR = dataDir;
  resetPathsForTests();
  await fs.ensureDir(path.join(dataDir, 'servers'));
});

afterEach(async () => {
  delete process.env.MCP_PORTAL_DATA_DIR;
  resetPathsForTests();
  await fs.remove(dataDir).catch(() => {});
});

// ── registerServer ────────────────────────────────────────────────────────────

describe('registerServer', () => {
  it('always writes schemaVersion on new records', async () => {
    const meta = await registerServer(baseServerInput());
    expect(meta.schemaVersion).toBe(METADATA_SCHEMA_VERSION);
  });

  it('sets createdAt and lastUpdatedAt as ISO strings', async () => {
    const meta = await registerServer(baseServerInput());
    expect(() => new Date(meta.createdAt).toISOString()).not.toThrow();
    expect(() => new Date(meta.lastUpdatedAt).toISOString()).not.toThrow();
  });

  it('persists metadata so getServerMetadata can read it back', async () => {
    const registered = await registerServer(baseServerInput());
    const loaded = await getServerMetadata(registered.slug);
    expect(loaded.slug).toBe(registered.slug);
    expect(loaded.name).toBe(registered.name);
    expect(loaded.schemaVersion).toBe(METADATA_SCHEMA_VERSION);
  });
});

// ── schema migration round-trip ───────────────────────────────────────────────

describe('getServerMetadata migration', () => {
  it('backfills schemaVersion on an old record that lacks it', async () => {
    // Write a "legacy" metadata file that mimics a pre-Phase-1 record
    const serverDir = path.join(dataDir, 'servers', 'legacy-server');
    await fs.ensureDir(serverDir);
    const metaPath = path.join(serverDir, 'metadata.json');

    const legacyRecord = {
      // no schemaVersion field
      name: 'Legacy Server',
      slug: 'legacy-server',
      sourceUrl: 'https://example.com/old',
      sourceType: 'generic',
      authKey: generateAuthKey(),
      chunkCount: 5,
      vectorIndexed: false,
      ingestionVersion: '1.0.0',
      embeddingModel: 'fuse',
      serverKind: 'docs-rag',
      credentialKeys: [],
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeJson(metaPath, legacyRecord, { spaces: 2 });

    // Register in index
    const indexPath = path.join(dataDir, 'registry.json');
    await fs.writeJson(indexPath, {
      version: '1.0.0',
      servers: { 'legacy-server': { slug: 'legacy-server', path: serverDir } },
    });

    const meta = await getServerMetadata('legacy-server');
    expect(meta.schemaVersion).toBe(METADATA_SCHEMA_VERSION);
  });

  it('writes migrated schemaVersion back to disk', async () => {
    const serverDir = path.join(dataDir, 'servers', 'old-server');
    await fs.ensureDir(serverDir);
    const metaPath = path.join(serverDir, 'metadata.json');

    const legacyRecord = {
      name: 'Old Server',
      slug: 'old-server',
      sourceUrl: 'https://example.com/docs',
      sourceType: 'generic',
      authKey: generateAuthKey(),
      chunkCount: 0,
      vectorIndexed: false,
      ingestionVersion: '1.0.0',
      embeddingModel: 'fuse',
      serverKind: 'docs-rag',
      credentialKeys: [],
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeJson(metaPath, legacyRecord);

    const indexPath = path.join(dataDir, 'registry.json');
    await fs.writeJson(indexPath, {
      version: '1.0.0',
      servers: { 'old-server': { slug: 'old-server', path: serverDir } },
    });

    // First read triggers migration + write
    await getServerMetadata('old-server');

    // Second read verifies it was persisted
    const onDisk = await fs.readJson(metaPath);
    expect(onDisk.schemaVersion).toBe(METADATA_SCHEMA_VERSION);
  });

  it('does not re-migrate a record already at the current schema version', async () => {
    const meta = await registerServer(baseServerInput());
    const metaPath = path.join(dataDir, 'servers', meta.slug, 'metadata.json');

    // First read may trigger a migration write (e.g. backfill of `definition`).
    await getServerMetadata(meta.slug);
    const statAfterFirst = await fs.stat(metaPath);

    await new Promise((r) => setTimeout(r, 10));

    // Second read on an already-migrated record must not write again.
    await getServerMetadata(meta.slug);
    const statAfterSecond = await fs.stat(metaPath);

    expect(statAfterSecond.mtimeMs).toBe(statAfterFirst.mtimeMs);
  });
});
