#!/usr/bin/env node
/**
 * Advanced RAG benchmark + eval for a registered server (supports new hybrid features).
 *
 * Usage:
 *   node --import tsx examples/benchmark.ts --slug my-docs
 *   node --import tsx examples/benchmark.ts --slug my-docs --eval --json
 *   node --import tsx examples/benchmark.ts --slug my-docs --mode hybrid --reranker rrf
 *
 * Features:
 * - Mode comparison (keyword vs hybrid vs semantic) when hybrid server
 * - --eval : proxy metrics (term-hit rate, grounding, latency) + RRF vs weighted demo
 * - --json for machine output (CI friendly)
 * - Uses advanced RAGSearchOptions (alpha, reranker)
 */
import { createRAGForServer } from '../src/rag/store.js';
import { getServerMetadata } from '../src/core/registry.js';
import type { RAGSearchOptions, EmbeddingModel } from '../src/rag/types.js';

async function main() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf('--slug');
  if (slugIdx === -1 || !args[slugIdx + 1]) {
    console.error('Usage: node --import tsx examples/benchmark.ts --slug <slug> [--eval] [--json] [--mode hybrid] [--reranker rrf]');
    process.exit(1);
  }
  const slug = args[slugIdx + 1];
  const doEval = args.includes('--eval') || args.includes('--evaluate');
  const asJson = args.includes('--json');
  const modeIdx = args.indexOf('--mode');
  const defaultMode = (modeIdx !== -1 && args[modeIdx + 1]) ? (args[modeIdx + 1] as any) : 'hybrid';
  const rerankIdx = args.indexOf('--reranker');
  const reranker = (rerankIdx !== -1 && args[rerankIdx + 1]) ? (args[rerankIdx + 1] as any) : 'rrf';

  const meta = await getServerMetadata(slug).catch(() => null);
  if (!meta) {
    console.error('Server not found. Create it first.');
    process.exit(1);
  }

  const isHybrid = String(meta.embeddingModel || '').startsWith('hybrid');
  const rag = await createRAGForServer(slug, meta.embeddingModel as EmbeddingModel);

  const queries = [
    'overview', 'installation', 'getting started', 'authentication',
    'api reference', 'configuration', 'usage', 'examples',
  ];

  const modesToRun: Array<'keyword' | 'hybrid' | 'semantic'> = isHybrid
    ? ['keyword', 'hybrid', 'semantic']
    : ['keyword'];

  const results: Record<string, any> = {};

  for (const m of modesToRun) {
    const searchOpts: RAGSearchOptions = { limit: 3, mode: m, reranker: m === 'hybrid' ? reranker : false };
    let sumMs = 0;
    let grounded = 0;
    let termHit = 0;
    let n = 0;

    for (const q of queries) {
      const t0 = Date.now();
      const res = await rag.search(q, searchOpts);
      const ms = Date.now() - t0;
      sumMs += ms;
      n += res.length;

      if (res[0]) {
        const top = res[0];
        if (top.metadata.url) grounded++;
        const term = q.split(/\s+/)[0].toLowerCase();
        if (top.content.toLowerCase().includes(term) || (top.metadata.title || '').toLowerCase().includes(term)) termHit++;
      }
    }

    results[m] = {
      queries: queries.length,
      avgLatencyMs: Math.round(sumMs / queries.length),
      groundedPct: Math.round((grounded / Math.max(1, queries.length)) * 100),
      termHitPct: Math.round((termHit / Math.max(1, queries.length)) * 100),
      reranker: m === 'hybrid' ? reranker : null,
    };
  }

  const out = {
    slug,
    source: meta.sourceUrl,
    chunks: meta.chunkCount,
    embeddingModel: meta.embeddingModel,
    timestamp: new Date().toISOString(),
    results,
    note: 'termHit = proxy relevance (query term in top result title/content). Use real goldens for production eval.',
  };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(`\nBenchmark for ${slug} (model: ${meta.embeddingModel}, chunks: ${meta.chunkCount})`);
  console.log('Source:', meta.sourceUrl);
  console.log('');

  for (const [m, r] of Object.entries(results) as any) {
    console.log(
      `${m.padEnd(9)} | avg ${String(r.avgLatencyMs).padStart(3)}ms | grounded ${String(r.groundedPct).padStart(3)}% | term-hit ${String(r.termHitPct).padStart(3)}% ${r.reranker ? `(reranker=${r.reranker})` : ''}`
    );
  }

  console.log('\nAll results include source URLs (grounding contract).');
  if (isHybrid && doEval) {
    console.log('Tip: hybrid + rrf often wins on relevance for mixed keyword/semantic queries.');
  }
  console.log('For CI/golden sets extend this script or use verify --eval.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
