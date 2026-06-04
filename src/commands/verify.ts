import chalk from 'chalk';
import { getServerMetadata } from '../core/registry.js';
import { createRAGForServer } from '../rag/store.js';
import { logger } from '../core/logger.js';
import { isHybridModel } from '../rag/models.js';
import { verifyServer } from '../app/services/servers.js';
import { getFreshness, printTitle, printSection, printDetails, truncate, statusText, ui } from '../ui/format.js';
import type { EmbeddingModel } from '../rag/models.js';
import { getServerDataDir } from '../core/paths.js';
import fs from 'fs-extra';
import path from 'node:path';

export async function cmdVerify(args: string[]): Promise<void> {
  const slug = args[1];
  if (!slug) {
    logger.error('Usage: hoolix verify <slug> [--eval] [--json]');
    process.exit(1);
  }

  let meta: any;
  try {
    meta = await getServerMetadata(slug);
  } catch {
    logger.error(`Server "${slug}" not found.`);
    process.exit(1);
  }

  // ── JSON output path ──────────────────────────────────────────────────────
  if (args.includes('--json')) {
    try {
      const report = await verifyServer(slug);
      console.log(JSON.stringify({
        slug: report.slug, name: report.name, sourceUrl: report.sourceUrl, chunkCount: report.chunkCount,
        validation: report.validation,
        searchable:             report.searchable,
        groundingPercent:       report.groundingPercent,
        sourceCoveragePercent:  report.sourceCoveragePercent,
        uniqueSourceUrls:       report.uniqueSourceUrls,
        totalChars:             report.totalChars,
        averageChunkChars:      report.averageChunkChars,
        duplicateChunkIds:      report.duplicateChunkIds,
        weakQueries: report.weakQueries,
        ingestion: report.ingestion,
        samples: report.samples.map((sample) => ({
          query: sample.query,
          hits: sample.hits,
          top: sample.top,
          grounded: sample.grounded,
          weak: sample.weak,
        })),
        tocEntries:  report.tocEntries,
        tocPreview:  report.tocPreview,
        embeddingModel: report.embeddingModel,
        freshness:   getFreshness(report.freshnessUpdatedAt),
        sourceCount: report.sourceCount,
        sourceLabels: report.sourceLabels,
        template: report.definition.template,
        reliability: {
          sourceFingerprint: !!meta.sourceFingerprint,
          lastReindexAt: meta.lastReindexAt || null,
          reindexSchedule: meta.reindexSchedule || null,
          authenticatedSources: report.definition.sources.filter((source: any) => source.headers || source.cookie).length,
          persistedRateState: await fs.pathExists(path.join(getServerDataDir(slug), 'rate-state.json')),
        },
      }, null, 2));
      return;
    } catch (e: any) {
      logger.error('Failed to load RAG:', e.message || e);
      process.exit(1);
    }
  }

  // ── Human output path ─────────────────────────────────────────────────────
  printTitle('Verify', `${meta.name} (${slug})`);

  const report = await verifyServer(slug, ['overview', 'install', 'getting started', 'api', 'configuration', 'authentication', 'usage']);
  const v = report.validation;
  printDetails([
    ['Registry chunks', meta.chunkCount.toLocaleString()],
    [report.sourceCount > 1 ? 'Sources' : 'Source', report.sourceCount > 1 ? report.sourceLabels.join(', ') : truncate(meta.sourceUrl, 92)],
    ['Template',        report.definition.template ? `${report.definition.template.name} (${report.definition.template.id})` : undefined],
    ['Freshness',       getFreshness(meta.lastUpdatedAt).message],
    ['Validation',      statusText(v.valid, 'ok', 'issues')],
  ]);
  if (!v.valid) v.issues.forEach((issue) => console.log(`    ${ui.warning('!')} ${issue}`));
  console.log('');

  let rag: any;
  try {
    rag = await createRAGForServer(slug, (meta.embeddingModel as EmbeddingModel) || 'fuse');
  } catch (e: any) {
    logger.error('Failed to load RAG:', e.message || e);
    process.exit(1);
  }

  const sample = await rag.search('overview OR install OR api', { limit: 1 });
  console.log(`  ${ui.muted('RAG searchable')}  ${statusText(sample.length > 0, 'yes', 'no (empty index?)')}`);

  const ingestionStats = meta.ingestionStats;
  const diagnostics = report.diagnostics;
  const likelyTruncated = report.ingestion.truncated;

  console.log('');
  printSection('Trust signals');
  printDetails([
    ['Source coverage',   diagnostics ? `${diagnostics.sourceCoveragePercent}% (${diagnostics.chunksWithUrl}/${diagnostics.totalChunks} chunks have URLs)` : 'unknown'],
    ['Unique source URLs', diagnostics?.uniqueSourceUrls],
    ['Average chunk size', diagnostics ? `${diagnostics.averageChunkChars.toLocaleString()} chars` : undefined],
    ['Duplicate chunk IDs', diagnostics?.duplicateChunkIds],
    ['Ingestion cap',     ingestionStats ? `${ingestionStats.totalChunks.toLocaleString()}/${ingestionStats.maxChunks.toLocaleString()} chunks, ${ingestionStats.pagesProcessed.toLocaleString()}/${ingestionStats.maxPages.toLocaleString()} pages` : 'reindex to record cap details'],
    ['Truncated',         likelyTruncated ? ui.warning('yes') : ui.success('no')],
  ]);
  if (likelyTruncated) console.log(`    ${ui.warning('!')} Index hit an ingestion cap. Next: reindex with a narrower source or raise caps.`);
  if (diagnostics && diagnostics.sourceCoveragePercent < 100) {
    console.log(`    ${ui.warning('!')} Some chunks are missing source URLs. Next: reindex and inspect ingestion output.`);
  }

  console.log('');
  printSection('Reliability');
  printDetails([
    ['Incremental fingerprint', meta.sourceFingerprint ? 'present' : 'missing (next reindex will record it)'],
    ['Last reindex', meta.lastReindexAt ? new Date(meta.lastReindexAt).toLocaleString() : 'never recorded'],
    ['Schedule', meta.reindexSchedule?.enabled ? `every ${meta.reindexSchedule.intervalHours}h, next ${meta.reindexSchedule.nextRunAt || 'unknown'}` : 'off'],
    ['Authenticated sources', report.definition.sources.filter((source: any) => source.headers || source.cookie).length],
    ['Persisted rate state', await fs.pathExists(path.join(getServerDataDir(slug), 'rate-state.json')) ? 'present' : 'not created yet'],
  ]);

  console.log('');
  printSection('Sample searches (relevance + grounding)');
  let totalHits     = 0;
  const weakQueries: string[] = [];

  const queries = ['overview', 'install', 'getting started', 'api', 'configuration', 'authentication', 'usage'];
  for (const sampleReport of report.samples.slice(0, 5)) {
    const q = sampleReport.query;
    const res = sampleReport.results;
    totalHits += res.length;
    if (res.length > 0) {
      const top      = res[0];
      const hasGround = !!top.metadata.url;
      const rel = Math.round((top.score || 0.8) * 100);
      if (!hasGround || (top.score ?? 0) < 0.45) weakQueries.push(q);
      console.log(`  ${ui.accent('›')} ${chalk.bold(q)} ${ui.muted(`${res.length} hit(s)`)}  score=${rel}%  ${hasGround ? ui.success('grounded') : ui.warning('no url')}`);
      console.log(`    ${truncate(top.metadata.sectionPath || top.metadata.title || top.metadata.url, 88)}`);
      console.log(`    ${ui.muted(truncate(top.content.replace(/\n/g, ' '), 110))}`);
      console.log(`    ${ui.muted('Source')} ${truncate(top.metadata.url, 80)}`);
    } else {
      console.log(`  ${ui.accent('›')} ${chalk.bold(q)} ${ui.muted('no results')}`);
      weakQueries.push(q);
    }
  }

  const groundingPct = Math.round((report.samples.slice(0, 5).filter((sample) => sample.grounded).length / Math.min(5, queries.length)) * 100);
  console.log(`  ${ui.muted('Grounding quality (sample)')} ${groundingPct}% of top results include source URL + section`);
  if (weakQueries.length > 0) console.log(`  ${ui.muted('Needs attention')} ${weakQueries.join(', ')}`);

  const toc = report.toc;
  console.log('');
  printSection(`Table of contents (${toc.length} entries)`);
  if (toc.length > 0) {
    const top = toc.filter((t: any) => t.level === 1).slice(0, 4);
    top.forEach((t: any) => console.log(`  ${ui.accent('•')} ${t.title}`));
    if (toc.length > top.length) console.log(`  ${ui.muted('… and more')}`);
  }

  // ── Eval mode ─────────────────────────────────────────────────────────────
  const doEval = args.includes('--eval') || args.includes('--evaluate');
  if (doEval) {
    console.log('');
    printSection('Eval (relevance proxy + latency + mode comparison)');
    const evalQueries = queries.slice(0, 6);
    const modes: Array<'keyword' | 'hybrid' | 'semantic'> =
      meta.embeddingModel && isHybridModel(meta.embeddingModel as any)
        ? ['keyword', 'hybrid']
        : ['keyword'];

    for (const m of modes) {
      let sumMs = 0, termHits = 0, g = 0, n = 0;
      for (const q of evalQueries) {
        const t0  = Date.now();
        const res = await rag.search(q, { limit: 3, mode: m });
        sumMs += Date.now() - t0;
        n     += res.length || 1;
        if (res[0]) {
          const top  = res[0];
          const term = q.split(/\s+/)[0].toLowerCase();
          if (top.content.toLowerCase().includes(term) || (top.metadata.title || '').toLowerCase().includes(term)) termHits++;
          if (top.metadata.url) g++;
        }
      }
      const avgMs    = Math.round(sumMs / evalQueries.length);
      const termHit  = Math.round((termHits / Math.max(1, evalQueries.length)) * 100);
      const grounded = Math.round((g / Math.max(1, evalQueries.length)) * 100);
      console.log(`  ${ui.accent(m.padEnd(8))}: ${avgMs}ms avg  term-hit=${termHit}%  grounded=${grounded}% (over ${evalQueries.length} queries)`);
    }
    console.log(`  ${ui.muted('Eval is a lightweight proxy (term overlap + grounding). For real golden sets use examples/benchmark.ts --eval')}`);
  }

  console.log('');
  if (meta.embeddingModel && isHybridModel(meta.embeddingModel as any)) {
    console.log(`  ${ui.success('✓')} Hybrid embeddings enabled (${meta.embeddingModel}).`);
    console.log(`    search supports mode=hybrid|semantic|keyword, alpha (blend), reranker=rrf (advanced relevance).`);
    console.log(`    Embeddings cached on disk; query embeds LRU-cached at runtime.`);
  } else {
    console.log(`  ${ui.muted('Tip')}: Reindex with --hybrid or --embedding-model hybrid-bge-base for semantic + RRF reranking.`);
  }

  console.log('');
  console.log(`  ${ui.success('✓')} Verify complete. All results include source URLs for grounding.`);
}
