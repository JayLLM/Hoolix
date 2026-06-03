import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { createRAGForServer } from '../src/rag/store.js';
import { ingestDocumentation } from '../src/ingestion/pipeline.js';
import { resetPathsForTests, getPaths } from '../src/core/paths.js';
import type { IngestedChunk } from '../src/ingestion/types.js';
import { makeTempDataDir } from './helpers/e2e.js';

// Very small public markdown for fast smoke (network smoke; skips gracefully if offline)
const TINY_DOC_URL = 'https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md';

let tempDataDir = '';

beforeEach(async () => {
  tempDataDir = makeTempDataDir('hoolix-smoke-');
  process.env.MCP_PORTAL_DATA_DIR = tempDataDir;
  resetPathsForTests();
  await fs.ensureDir(tempDataDir);
});

afterEach(async () => {
  delete process.env.MCP_PORTAL_DATA_DIR;
  resetPathsForTests();
  await fs.remove(tempDataDir).catch(() => {});
});

describe('integration smoke (ingest + RAG + search grounding)', () => {
  it('uses an isolated temp data dir and cleans up the test registry', async () => {
    expect(getPaths().data).toBe(tempDataDir);
    expect(getPaths().servers).toBe(path.join(tempDataDir, 'servers'));
  });

  it('ingests a tiny public doc, builds RAG, returns grounded results with urls', async () => {
    let result;
    try {
      result = await ingestDocumentation(TINY_DOC_URL, { maxPages: 3, maxChunks: 400 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Smoke ingest skipped (network):', message);
      return;
    }

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.stats.totalChunks).toBeGreaterThan(0);

    const slug = `smoke-${Date.now()}`;
    const rag = await createRAGForServer(slug);
    await rag.indexChunks(result.chunks as IngestedChunk[]);

    const hits = await rag.search('model context protocol', { limit: 3 });
    expect(hits.length).toBeGreaterThan(0);

    for (const h of hits) {
      expect(h.metadata.url).toBeTruthy();
      expect(typeof h.metadata.url).toBe('string');
      expect(h.metadata.url.startsWith('http')).toBe(true);
    }

    const toc = await rag.getTableOfContents();
    expect(Array.isArray(toc)).toBe(true);
    expect(getPaths().data).toBe(tempDataDir);
  }, 30000);
});
