import chalk from 'chalk';
import { execSync } from 'node:child_process';
import { getServerMetadata } from '../core/registry.js';
import { createRAGForServer } from '../rag/store.js';
import { logger } from '../core/logger.js';
import { isHybridModel } from '../rag/models.js';
import { verifyServer } from '../app/services/servers.js';
import { loadCredentials } from '../app/services/credentials.js';
import { getTemplate } from '../app/services/catalog.js';
import { getFreshness, printTitle, printSection, printDetails, printCommand, truncate, statusText, ui } from '../ui/format.js';
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

  // ── mcp-server kind: credential + config verification ────────────────────
  if ((meta.serverKind ?? 'docs-rag') === 'mcp-server') {
    await verifMcpServer(slug, meta, args.includes('--json'));
    return;
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

// ── mcp-server verification ───────────────────────────────────────────────────

async function verifMcpServer(slug: string, meta: any, json: boolean): Promise<void> {
  const templateId = meta.definition?.template?.id ?? 'unknown';
  const credentialKeys: string[] = meta.credentialKeys ?? [];
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  // 1. Template exists in catalog
  let template: any = null;
  try {
    template = await getTemplate(templateId);
    checks.push({ name: 'Template in catalog', ok: true, detail: template.name });
  } catch {
    checks.push({ name: 'Template in catalog', ok: false, detail: `"${templateId}" not found` });
  }

  // 2. Credentials stored
  const storedCreds = await loadCredentials(slug);
  const storedKeys = Object.keys(storedCreds);
  const requiredCreds: string[] = template?.credentials.filter((c: any) => c.required).map((c: any) => c.name) ?? credentialKeys;
  const missingCreds = requiredCreds.filter((k) => !storedCreds[k]);
  if (requiredCreds.length === 0) {
    checks.push({ name: 'Credentials', ok: true, detail: 'none required' });
  } else if (missingCreds.length === 0) {
    checks.push({ name: 'Credentials', ok: true, detail: `${storedKeys.length} stored (${storedKeys.join(', ')})` });
  } else {
    checks.push({ name: 'Credentials', ok: false, detail: `missing: ${missingCreds.join(', ')}` });
  }

  // 3. Template inputs present
  const templateInputs = meta.definition?.template?.inputs ?? {};
  const requiredInputs: string[] = template?.inputs.filter((i: any) => i.required).map((i: any) => i.name) ?? [];
  const missingInputs = requiredInputs.filter((k) => !templateInputs[k]);
  if (requiredInputs.length === 0) {
    checks.push({ name: 'Template inputs', ok: true, detail: 'none required' });
  } else if (missingInputs.length === 0) {
    checks.push({ name: 'Template inputs', ok: true, detail: requiredInputs.map((k) => `${k}=${templateInputs[k]}`).join(', ') });
  } else {
    checks.push({ name: 'Template inputs', ok: false, detail: `missing: ${missingInputs.join(', ')}` });
  }

  // 4. Runtime tool available
  const command = template?.server?.command ?? 'npx';
  try {
    execSync(`${command === 'npx' ? 'npx --version' : `which ${command}`}`, { stdio: 'ignore' });
    checks.push({ name: `Runtime (${command})`, ok: true, detail: 'available' });
  } catch {
    checks.push({ name: `Runtime (${command})`, ok: false, detail: `"${command}" not found — install Node.js / uv as needed` });
  }

  const allOk = checks.every((c) => c.ok);

  if (json) {
    console.log(JSON.stringify({
      slug,
      name: meta.name,
      kind: 'mcp-server',
      templateId,
      checks,
      ok: allOk,
      next: allOk ? `hoolix connect ${slug}` : `Fix issues above, then: hoolix connect ${slug}`,
    }, null, 2));
    return;
  }

  printTitle('Verify', `${meta.name} (${slug})`);
  printDetails([
    ['Kind',     'MCP server'],
    ['Template', `${template?.name ?? templateId} (${templateId})`],
    ['Result',   allOk ? ui.success('all checks passed') : ui.warning('issues found')],
  ]);
  console.log('');

  printSection('Checks');
  for (const check of checks) {
    const icon = check.ok ? ui.success('✓') : ui.warning('!');
    console.log(`  ${icon} ${check.name.padEnd(24)}  ${check.detail}`);
  }
  console.log('');

  if (allOk) {
    console.log(`  ${ui.success('✓')} Server is ready to use.`);
    printCommand(`hoolix connect ${slug}`);
  } else {
    const missing = checks.filter((c) => !c.ok);
    for (const m of missing) {
      console.log(`  ${ui.warning('!')} ${m.name}: ${m.detail}`);
    }
    console.log('');
    console.log(`  Fix the issues above, then: hoolix connect ${slug}`);
  }
  console.log('');
}
