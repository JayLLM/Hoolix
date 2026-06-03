import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { getPaths, getServerDataDir } from '../src/core/paths.js';
import { createRAGForServer, cosineSimilarity, reciprocalRankFusion } from '../src/rag/store.js';
import type { IngestedChunk } from '../src/ingestion/types.js';
import type { RAGSearchOptions } from '../src/rag/types.js';

const TEST_SLUG = `vitest-rag-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

function makeChunk(content: string, url: string, section?: string, order = 0): IngestedChunk {
  return {
    id: `c${order}`,
    content,
    metadata: {
      url,
      title: 'Test Doc',
      sectionPath: section,
      headings: section ? section.split(' > ') : [],
      charCount: content.length,
      order,
    },
  };
}

async function cleanup() {
  try {
    const dir = getServerDataDir(TEST_SLUG);
    if (await fs.pathExists(dir)) await fs.remove(dir);
    const serversDir = getPaths().servers;
    if (await fs.pathExists(serversDir)) {
      const entries = await fs.readdir(serversDir);
      for (const entry of entries) {
        if (entry.startsWith(TEST_SLUG)) {
          await fs.remove(path.join(serversDir, entry));
        }
      }
    }
  } catch {}
}

afterEach(async () => {
  await cleanup();
});

describe('DocumentationRAG (search / read / toc)', () => {
  it('indexes chunks, searches with direct + fuse, returns source URLs', async () => {
    const rag = await createRAGForServer(TEST_SLUG);
    const chunks = [
      makeChunk('The quick brown fox jumps over the lazy dog. Authentication uses Bearer tokens.', 'https://ex.com/auth.md', 'Auth > Overview', 0),
      makeChunk('Installation: bun install hoolix. Then run hoolix create.', 'https://ex.com/install.md', 'Getting Started > Install', 1),
      makeChunk('Use search_documentation tool for RAG queries.', 'https://ex.com/tools.md', 'MCP Tools', 2),
    ];
    await rag.indexChunks(chunks);

    const res = await rag.search('authentication bearer', { limit: 5 });
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].metadata.url).toContain('auth.md');
    expect(res[0].content).toContain('Bearer');

    // keyword that should hit direct path
    const res2 = await rag.search('bun install', { limit: 3 });
    expect(res2.some(r => r.content.includes('bun install'))).toBe(true);
  });

  it('readPage returns concatenated chunks for url fragment + section match', async () => {
    const rag = await createRAGForServer(TEST_SLUG);
    await rag.indexChunks([
      makeChunk('Page one content alpha.', 'https://ex.com/p1.md', 'P1', 0),
      makeChunk('Page one more beta.', 'https://ex.com/p1.md', 'P1', 1),
      makeChunk('Different page.', 'https://ex.com/p2.md', 'P2', 2),
    ]);

    const page = await rag.readPage('p1.md', 10);
    expect(page).not.toBeNull();
    expect(page!.url).toBe('https://ex.com/p1.md');
    expect(page!.content).toContain('alpha');
    expect(page!.content).toContain('beta');
    expect(page!.chunks.length).toBe(2);
  });

  it('getTableOfContents reconstructs hierarchy from sectionPaths', async () => {
    const rag = await createRAGForServer(TEST_SLUG);
    await rag.indexChunks([
      makeChunk('c1', 'u1', 'Guide > Basics', 0),
      makeChunk('c2', 'u1', 'Guide > Basics > Auth', 1),
      makeChunk('c3', 'u2', 'Reference > API', 2),
    ]);

    const toc = await rag.getTableOfContents();
    const titles = toc.map(t => t.title);
    expect(titles).toContain('Guide');
    expect(titles).toContain('Basics');
    expect(titles).toContain('Auth');
    expect(titles).toContain('Reference');
    // levels
    const guide = toc.find(t => t.title === 'Guide');
    expect(guide?.level).toBe(1);
  });

  it('getTableOfContents preserves source order instead of alphabetical order', async () => {
    const rag = await createRAGForServer(TEST_SLUG + '-toc-order');
    await rag.indexChunks([
      makeChunk('api reference first', 'https://ex.com/reference.md', 'Reference > API', 0),
      makeChunk('getting started second', 'https://ex.com/guide.md', 'Guide > Basics', 1),
    ]);

    const toc = await rag.getTableOfContents();
    expect(toc.map(t => t.sectionPath)).toEqual([
      'Reference',
      'Reference > API',
      'Guide',
      'Guide > Basics',
    ]);
  });

  it('returns empty results gracefully for empty index', async () => {
    const rag = await createRAGForServer(TEST_SLUG + '-empty');
    const res = await rag.search('anything');
    expect(res).toEqual([]);
    const page = await rag.readPage('nope');
    expect(page).toBeNull();
    const toc = await rag.getTableOfContents();
    expect(toc).toEqual([]);
  });

  it('supports advanced RAGSearchOptions (alpha, reranker) and exports cosine/RRF', async () => {
    const rag = await createRAGForServer(TEST_SLUG + '-adv');
    const chunks = [
      makeChunk('Authentication with Bearer tokens and API keys is described here.', 'https://ex.com/auth.md', 'Auth', 0),
      makeChunk('Install via bun install. Then configure the client.', 'https://ex.com/install.md', 'Install', 1),
      makeChunk('The search tool supports hybrid mode with reranking for better results.', 'https://ex.com/search.md', 'Search', 2),
    ];
    await rag.indexChunks(chunks);

    // Basic search still works
    const res = await rag.search('bearer auth', { limit: 2 });
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].metadata.url).toContain('auth');

    // Advanced opts accepted (no crash; fuse path)
    const res2 = await rag.search('install bun', { limit: 2, mode: 'keyword', alpha: 0.3, reranker: 'rrf' } as RAGSearchOptions);
    expect(res2.length).toBeGreaterThan(0);

    // Pure utils
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);

    const rrf = reciprocalRankFusion([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
    expect(rrf.get('b')).toBeGreaterThan(0);
  });

  it('ranks weak single-word queries by title and section, not incidental mentions', async () => {
    const rag = await createRAGForServer(TEST_SLUG + '-weak-query');
    await rag.indexChunks([
      makeChunk('Release notes mention install once as historical context.', 'https://ex.com/changelog.md', 'Release Notes', 0),
      makeChunk('Run bun install, then hoolix create, verify, start, and connect.', 'https://ex.com/install.md', 'Getting Started > Installation', 1),
      makeChunk('Troubleshooting also mentions install failures in passing.', 'https://ex.com/troubleshooting.md', 'Troubleshooting', 2),
    ]);

    const res = await rag.search('install', { limit: 3, mode: 'keyword' });
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].metadata.url).toContain('install.md');
    expect(res[0].metadata.sectionPath).toContain('Installation');
  });

  it('reports source coverage diagnostics from indexed chunks', async () => {
    const rag = await createRAGForServer(TEST_SLUG + '-diagnostics');
    await rag.indexChunks([
      makeChunk('one', 'https://ex.com/a.md', 'A', 0),
      makeChunk('two', 'https://ex.com/a.md', 'A > Two', 1),
      makeChunk('three', 'https://ex.com/b.md', 'B', 2),
    ]);

    const diagnostics = await rag.getDiagnostics();
    expect(diagnostics.totalChunks).toBe(3);
    expect(diagnostics.sourceCoveragePercent).toBe(100);
    expect(diagnostics.uniqueSourceUrls).toBe(2);
    expect(diagnostics.duplicateChunkIds).toBe(0);
  });
});
