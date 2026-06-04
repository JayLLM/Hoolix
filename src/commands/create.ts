import { intro, outro, text, confirm, isCancel, cancel, spinner } from '@clack/prompts';
import chalk from 'chalk';
import { slugify } from '../core/registry.js';
import { loadConfig } from '../core/config.js';
import { logger } from '../core/logger.js';
import { ServerAlreadyExistsError } from '../core/errors.js';
import { resolveEmbeddingModel } from '../lib/embedding.js';
import { createServer } from '../app/services/servers.js';
import { instantiateTemplate } from '../app/services/catalog.js';
import type { AppProgressEvent } from '../app/events.js';
import { applySourceAuth, parseCliCookie, parseCliHeaders, parseCliSources, sourceLabel } from '../sources/registry.js';
import type { ServerDefinition, SourceDefinition } from '../sources/types.js';
import {
  printTitle, printSection, printCommand, printDetails, printJson, truncate, ui, parseOption,
} from '../ui/format.js';

export async function cmdCreate(args: string[], json: boolean): Promise<void> {
  if (!json) intro(chalk.bold('hoolix create'));

  let name = args[1];
  let url  = '';
  let sources: SourceDefinition[] = [];
  let templateDefinition: ServerDefinition | undefined;
  let templateName: string | undefined;

  const urlIdx = args.indexOf('--url');
  if (urlIdx !== -1 && args[urlIdx + 1]) url = args[urlIdx + 1];
  const templateId = parseOption(args, '--template');
  const repoInput = parseOption(args, '--repo');
  try {
    sources = parseCliSources(args);
    const headers = parseCliHeaders(args);
    const cookie = parseCliCookie(args);
    sources = applySourceAuth(sources, { headers, cookie });
    if (templateId) {
      const inputs: Record<string, string> = {};
      if (url) inputs.url = url;
      if (repoInput) inputs.repo = repoInput;
      const instantiated = await instantiateTemplate(templateId, inputs);
      templateDefinition = {
        ...instantiated.definition,
        sources: applySourceAuth(instantiated.definition.sources, { headers, cookie }),
      };
      templateName = instantiated.template.name;
    } else if (url && (Object.keys(headers).length > 0 || cookie)) {
      templateDefinition = {
        version: 1,
        sources: applySourceAuth([{ type: 'docs', url, label: 'docs' }], { headers, cookie }),
      };
    }
  } catch (e: any) {
    if (json) printJson({ ok: false, error: e?.message || String(e) });
    else logger.error(e?.message || String(e));
    process.exit(1);
  }

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

  if (!url && sources.length === 0 && !templateDefinition) {
    if (json) {
      printJson({ ok: false, error: 'Missing --url, --source, or --template. Next: pass hoolix create <name> --url <url> --yes --json, use --source docs:<url>, or --template docs-rag --url <url>.' });
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
    const sourceText = sources.length > 0
      ? sources.map(sourceLabel).join(', ')
      : templateDefinition
        ? `template ${templateId}`
        : url;
    confirmed = await confirm({ message: `Create server "${name}" (${slug}) from ${sourceText}?` });
  }
  if (isCancel(confirmed) || !confirmed) { cancel('Cancelled'); process.exit(0); }

  const s = json ? null : spinner();
  let ragSpinner: any = null;
  let ingestStopped = false;
  let lastIngestMessage = 'Ingestion complete';
  s?.start('Ingesting documentation... (10–120s for multi-page llms.txt sites)');

  try {
    const cfg            = await loadConfig();
    const embeddingModel = resolveEmbeddingModel(args, cfg);

    const created = await createServer({
      name,
      url: sources.length > 0 || templateDefinition ? undefined : url,
      sources: sources.length > 0 ? sources : undefined,
      definition: templateDefinition,
      templateId,
      embeddingModel,
      maxChunks: 6000,
      maxPages: 80,
      onProgress: (p: AppProgressEvent) => {
        if (p.stage === 'index') {
          if (!ingestStopped) {
            ingestStopped = true;
            s?.stop(lastIngestMessage);
            ragSpinner = json ? null : spinner();
            ragSpinner?.start('Building search index...');
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
    const scheduleValue = parseOption(args, '--schedule');
    if (scheduleValue) {
      const { updateReindexSchedule } = await import('../app/services/servers.js');
      const hours = scheduleValue === 'daily' ? 24 : scheduleValue === 'hourly' ? 1 : parseInt(scheduleValue, 10);
      if (Number.isFinite(hours) && hours > 0) await updateReindexSchedule(created.meta.slug, hours);
    }
    const { meta, ingestion: result } = created;
    if (!ingestStopped) {
      s?.stop(`Ingestion complete: ${result.stats.totalChunks} chunks, ${(result.stats.totalChars / 1000).toFixed(1)}k chars`);
    }
    if (created.indexWarning) {
      ragSpinner?.stop('Search index step had issues (server registered; you can reindex later)');
      if (!json) logger.warn('RAG indexing error:', created.indexWarning);
    } else {
      ragSpinner?.stop(`Search index built (${created.indexLabel})`);
    }

    const pagesInfo = result.sourceUrl.includes('llms-full.txt')
      ? 'llms-full.txt (concatenated documentation)'
      : `${result.stats.pagesProcessed} page(s)`;
    const definitionSources = meta.definition?.sources ?? sources;
    const definitionMultiSource = definitionSources.length > 1;

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
        ...(sources.length > 0 || templateDefinition ? {
          sourceCount: definitionSources.length,
          sources: definitionSources,
        } : {}),
        ...(meta.definition?.template ? { template: meta.definition.template } : {}),
        next:           [`hoolix start ${meta.slug}`, `hoolix verify ${meta.slug} --json`],
      });
    } else {
      outro(`${ui.success('✓')} Server "${name}" created successfully`);
      printTitle('Ready', 'Your authenticated MCP server is registered.');
      printDetails([
        ['Slug',   meta.slug],
        ['Chunks', `${meta.chunkCount.toLocaleString()} from ${pagesInfo}`],
        [definitionMultiSource ? 'Sources' : 'Source', definitionMultiSource ? definitionSources.map(sourceLabel).join(', ') : truncate(result.sourceUrl, 92)],
        ['Template', templateName],
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
