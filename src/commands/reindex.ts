import { confirm, isCancel, cancel, spinner } from '@clack/prompts';
import { getServerMetadata } from '../core/registry.js';
import { loadConfig } from '../core/config.js';
import { logger } from '../core/logger.js';
import { resolveEmbeddingModel, isHybridModel } from '../lib/embedding.js';
import { listDueReindexServers, reindexServer, updateReindexSchedule } from '../app/services/servers.js';
import type { AppProgressEvent } from '../app/events.js';
import { printTitle, printDetails, printJson } from '../ui/format.js';

export async function cmdReindex(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
  if (args.includes('--due')) {
    const due = await listDueReindexServers();
    const cfg = await loadConfig();
    const results = [];
    for (const server of due) {
      const embeddingModel = resolveEmbeddingModel(args, cfg);
      const result = await reindexServer({ slug: server.slug, embeddingModel, maxChunks: 6000, maxPages: 80 });
      results.push({ slug: server.slug, skipped: !!result.skipped, chunks: result.ingestion.stats.totalChunks });
    }
    if (json) printJson({ ok: true, due: due.length, results });
    else {
      printTitle('Scheduled Reindex', `${due.length} due server${due.length === 1 ? '' : 's'} processed.`);
      printDetails(results.map((r) => [r.slug, r.skipped ? 'unchanged' : `${r.chunks} chunks`]));
    }
    return;
  }
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix reindex <slug> --yes --json.' });
    else logger.error('Usage: hoolix reindex <slug> [--yes] [--json]');
    process.exit(1);
  }

  let meta: any;
  try {
    meta = await getServerMetadata(slug);
  } catch {
    if (json) printJson({ ok: false, slug, error: `Server "${slug}" not found.` });
    else logger.error(`Server "${slug}" not found.`);
    process.exit(1);
  }

  if (!meta.sourceUrl) {
    if (json) printJson({ ok: false, slug, error: 'This server has no recorded sourceUrl and cannot be reindexed.' });
    else logger.error('This server has no recorded sourceUrl and cannot be reindexed.');
    process.exit(1);
  }

  const scheduleValue = args.includes('--schedule') ? args[args.indexOf('--schedule') + 1] : undefined;
  if (scheduleValue) {
    const hours = scheduleValue === 'off'
      ? null
      : scheduleValue === 'daily'
        ? 24
        : scheduleValue === 'hourly'
          ? 1
          : parseInt(scheduleValue, 10);
    if (hours === null || (Number.isFinite(hours) && hours > 0)) {
      await updateReindexSchedule(slug, hours);
    } else {
      if (json) printJson({ ok: false, slug, error: 'Invalid --schedule. Next: use hourly, daily, off, or a positive hour count.' });
      else logger.error('Invalid --schedule. Next: use hourly, daily, off, or a positive hour count.');
      process.exit(1);
    }
  }

  const force = args.includes('--yes') || args.includes('-y');
  if (json && !force) {
    printJson({ ok: false, slug, error: 'Reindex requires confirmation. Next: pass --yes with --json.' });
    process.exit(1);
  }

  let confirmed: boolean | symbol = force;
  if (!force) {
    confirmed = await confirm({
      message: `Re-ingest "${meta.name}" (${slug}) from ${meta.sourceUrl} and rebuild its index?`,
    });
  }
  if (isCancel(confirmed) || !confirmed) {
    cancel('Reindex cancelled');
    return;
  }

  const s = json ? null : spinner();
  let ragSpinner: any = null;
  let ingestStopped = false;
  let lastIngestMessage = 'Re-ingestion complete';
  s?.start('Re-ingesting documentation...');

  try {
    const cfg            = await loadConfig();
    const embeddingModel = resolveEmbeddingModel(args, cfg);

    const reindexed = await reindexServer({
      slug,
      embeddingModel,
      maxChunks: 6000,
      maxPages: 80,
      incremental: !args.includes('--no-incremental'),
      force: args.includes('--force'),
      onProgress: (p: AppProgressEvent) => {
        if (p.stage === 'index') {
          if (!ingestStopped) {
            ingestStopped = true;
            s?.stop(lastIngestMessage);
            ragSpinner = json ? null : spinner();
            ragSpinner?.start('Rebuilding search index...');
          }
          if (p.message && p.message !== 'Building search index...') ragSpinner?.message(p.message);
          return;
        }
        if (p.stage === 'embed') {
          if (p.message) ragSpinner?.message(p.message);
          return;
        }
        if (p.message && !ingestStopped) {
          const suffix = p.current != null && p.total != null ? ` (${p.current}/${p.total})` : '';
          lastIngestMessage = `${p.message}${suffix}`;
          s?.message(lastIngestMessage);
        }
      },
    });
    const result = reindexed.ingestion;
    const isLlmsFull = result.sourceUrl.includes('llms-full.txt');
    const pagesInfo  = isLlmsFull
      ? 'llms-full.txt (concatenated documentation)'
      : `${result.stats.pagesProcessed} page(s)`;
    if (!ingestStopped) {
      s?.stop(`Re-ingestion complete: ${result.stats.totalChunks} chunks from ${pagesInfo}`);
    }
    if (reindexed.indexWarning) {
      ragSpinner?.stop('Index rebuild encountered issues');
      if (!json) logger.warn('RAG reindex error:', reindexed.indexWarning);
    } else {
      ragSpinner?.stop(reindexed.skipped ? 'Search index unchanged (incremental skip)' : `Search index rebuilt (${reindexed.indexLabel})`);
    }

    if (json) {
      printJson({
        ok:             true,
        slug,
        sourceUrl:      result.sourceUrl,
        sourceType:     result.sourceType,
        chunkCount:     result.stats.totalChunks,
        pagesProcessed: result.stats.pagesProcessed,
        embeddingModel,
        vectorIndexed:  isHybridModel(embeddingModel),
        skipped:        reindexed.skipped || false,
        schedule:       reindexed.meta.reindexSchedule || null,
      });
    } else {
      printTitle('Reindexed', `"${slug}" is fresh and searchable.`);
      printDetails([
        ['Chunks', `${result.stats.totalChunks.toLocaleString()} from ${pagesInfo}`],
        ['Index',  isHybridModel(embeddingModel) ? `Hybrid (${embeddingModel})` : 'Fuse.js JSON'],
      ]);
      console.log('');
    }
  } catch (err: any) {
    s?.stop('Reindex failed');
    if (json) printJson({ ok: false, slug, error: err.message || String(err), next: 'Check the source URL and retry.' });
    else logger.error('Failed to reindex:', err.message || err);
    process.exit(1);
  }
}
