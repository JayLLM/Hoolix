import { confirm, isCancel, cancel, spinner } from '@clack/prompts';
import { getServerMetadata, updateServerMetadata } from '../core/registry.js';
import { loadConfig } from '../core/config.js';
import { logger } from '../core/logger.js';
import { ingestDocumentation } from '../ingestion/pipeline.js';
import { createRAGForServer } from '../rag/store.js';
import { resolveEmbeddingModel, isHybridModel } from '../lib/embedding.js';
import { printTitle, printDetails, printJson } from '../ui/format.js';

export async function cmdReindex(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
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
  s?.start('Re-ingesting documentation...');

  try {
    const result = await ingestDocumentation(meta.sourceUrl, {
      maxChunks:  6000,
      maxPages:   80,
      onProgress: (p) => {
        if (p.message) {
          const suffix = p.current != null && p.total != null ? ` (${p.current}/${p.total})` : '';
          s?.message(`${p.message}${suffix}`);
        }
      },
    });

    const isLlmsFull = result.sourceUrl.includes('llms-full.txt');
    const pagesInfo  = isLlmsFull
      ? 'llms-full.txt (concatenated documentation)'
      : `${result.stats.pagesProcessed} page(s)`;
    s?.stop(`Re-ingestion complete: ${result.stats.totalChunks} chunks from ${pagesInfo}`);

    const cfg            = await loadConfig();
    const embeddingModel = resolveEmbeddingModel(args, cfg);

    const ragSpinner = json ? null : spinner();
    ragSpinner?.start('Rebuilding search index...');
    try {
      const rag = await createRAGForServer(slug, embeddingModel);
      await rag.indexChunks(result.chunks, {
        embeddingModel,
        onProgress: (p) => { if (p.stage === 'embed' && p.message) ragSpinner?.message(p.message); },
      });
      await rag.close?.();
      const idxLabel = isHybridModel(embeddingModel) ? `Hybrid (${embeddingModel})` : 'Fuse.js';
      ragSpinner?.stop(`Search index rebuilt (${idxLabel})`);
    } catch (e: any) {
      ragSpinner?.stop('Index rebuild encountered issues');
      if (!json) logger.warn('RAG reindex error:', e?.message || e);
    }

    await updateServerMetadata(slug, {
      chunkCount:     result.stats.totalChunks,
      sourceType:     result.sourceType,
      ingestionStats: result.stats,
      embeddingModel,
      vectorIndexed:  isHybridModel(embeddingModel),
    });

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
