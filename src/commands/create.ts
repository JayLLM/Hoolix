import { intro, outro, text, confirm, isCancel, cancel, spinner } from '@clack/prompts';
import chalk from 'chalk';
import { registerServer, slugify } from '../core/registry.js';
import { loadConfig } from '../core/config.js';
import { logger } from '../core/logger.js';
import { ingestDocumentation } from '../ingestion/pipeline.js';
import { createRAGForServer } from '../rag/store.js';
import { ServerAlreadyExistsError } from '../core/errors.js';
import { generateAuthKey } from '../lib/auth.js';
import { resolveEmbeddingModel, isHybridModel } from '../lib/embedding.js';
import {
  printTitle, printSection, printCommand, printDetails, printJson, truncate, ui,
} from '../ui/format.js';

export async function cmdCreate(args: string[], json: boolean): Promise<void> {
  if (!json) intro(chalk.bold('hoolix create'));

  let name = args[1];
  let url  = '';

  const urlIdx = args.indexOf('--url');
  if (urlIdx !== -1 && args[urlIdx + 1]) url = args[urlIdx + 1];

  if (!name) {
    if (json) {
      printJson({ ok: false, error: 'Missing server name. Next: pass hoolix create <name> --url <url> --yes --json.' });
      process.exit(1);
    }
    const nameInput = await text({
      message:  'Server name (human readable)',
      placeholder: 'My Company Docs',
      validate: (v) => (v && v.length > 1 ? undefined : 'Name is required'),
    });
    if (isCancel(nameInput)) { cancel('Cancelled'); process.exit(0); }
    name = String(nameInput);
  }

  if (!url) {
    if (json) {
      printJson({ ok: false, error: 'Missing --url. Next: pass hoolix create <name> --url <url> --yes --json.' });
      process.exit(1);
    }
    const urlInput = await text({
      message:  'Documentation URL (llms.txt, docs site, or GitHub)',
      placeholder: 'https://docs.example.com/llms.txt',
      validate: (v) => {
        if (!v) return 'URL is required';
        try { new URL(v); return undefined; } catch { return 'Must be a valid URL'; }
      },
    });
    if (isCancel(urlInput)) { cancel('Cancelled'); process.exit(0); }
    url = String(urlInput);
  }

  const slug  = slugify(name);
  const force = args.includes('--yes') || args.includes('-y');
  if (json && !force) {
    printJson({ ok: false, error: 'Creation requires confirmation. Next: pass --yes with --json.' });
    process.exit(1);
  }

  let confirmed: boolean | symbol = force;
  if (!force) {
    confirmed = await confirm({ message: `Create server "${name}" (${slug}) from ${url}?` });
  }
  if (isCancel(confirmed) || !confirmed) { cancel('Cancelled'); process.exit(0); }

  const s = json ? null : spinner();
  s?.start('Ingesting documentation... (10–120s for multi-page llms.txt sites)');

  try {
    const result = await ingestDocumentation(url, {
      maxChunks: 6000,
      maxPages:  80,
      onProgress: (p) => {
        if (p.message) {
          const suffix = p.current != null && p.total != null ? ` (${p.current}/${p.total})` : '';
          s?.message(`${p.message}${suffix}`);
        }
      },
    });
    s?.stop(`Ingestion complete: ${result.stats.totalChunks} chunks, ${(result.stats.totalChars / 1000).toFixed(1)}k chars`);

    const cfg            = await loadConfig();
    const embeddingModel = resolveEmbeddingModel(args, cfg);

    const ragSpinner = json ? null : spinner();
    ragSpinner?.start('Building search index...');
    try {
      const rag = await createRAGForServer(slug, embeddingModel);
      await rag.indexChunks(result.chunks, {
        embeddingModel,
        onProgress: (p) => { if (p.stage === 'embed' && p.message) ragSpinner?.message(p.message); },
      });
      await rag.close?.();
      const idxLabel = isHybridModel(embeddingModel) ? `Hybrid (${embeddingModel})` : 'Fuse.js';
      ragSpinner?.stop(`Search index built (${idxLabel})`);
    } catch (ragErr: any) {
      ragSpinner?.stop('Search index step had issues (server registered; you can reindex later)');
      if (!json) logger.warn('RAG indexing error:', ragErr.message || ragErr);
    }

    const meta = await registerServer({
      name,
      slug,
      sourceUrl:        result.sourceUrl,
      sourceType:       result.sourceType,
      ingestionVersion: '1.0.0',
      embeddingModel,
      chunkCount:       result.stats.totalChunks,
      ingestionStats:   result.stats,
      vectorIndexed:    isHybridModel(embeddingModel),
      authKey:          generateAuthKey(),
      desiredState:     'stopped',
    });

    const pagesInfo = result.sourceUrl.includes('llms-full.txt')
      ? 'llms-full.txt (concatenated documentation)'
      : `${result.stats.pagesProcessed} page(s)`;

    if (json) {
      printJson({
        ok:             true,
        slug:           meta.slug,
        name:           meta.name,
        sourceUrl:      meta.sourceUrl,
        sourceType:     meta.sourceType,
        chunkCount:     meta.chunkCount,
        pagesProcessed: result.stats.pagesProcessed,
        embeddingModel: meta.embeddingModel,
        vectorIndexed:  meta.vectorIndexed,
        next:           [`hoolix start ${meta.slug}`, `hoolix verify ${meta.slug} --json`],
      });
    } else {
      outro(`${ui.success('✓')} Server "${name}" created successfully`);
      printTitle('Ready', 'Your authenticated MCP server is registered.');
      printDetails([
        ['Slug',   meta.slug],
        ['Chunks', `${meta.chunkCount.toLocaleString()} from ${pagesInfo}`],
        ['Source', truncate(result.sourceUrl, 92)],
      ]);
      console.log('');
      printSection('Next');
      printCommand(`hoolix start ${meta.slug}`);
      console.log('');
    }
  } catch (err: any) {
    s?.stop('Ingestion failed');
    if (json) {
      printJson({
        ok:    false,
        error: err instanceof ServerAlreadyExistsError
          ? `A server with slug "${slug}" already exists.`
          : err.message || String(err),
        next: err instanceof ServerAlreadyExistsError
          ? `hoolix delete ${slug} --yes`
          : 'Check the URL and retry.',
      });
    } else if (err instanceof ServerAlreadyExistsError) {
      logger.error(`A server with slug "${slug}" already exists.`);
    } else {
      logger.error('Failed to create server:', err.message || err);
    }
    process.exit(1);
  }
}
