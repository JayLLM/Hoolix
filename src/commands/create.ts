import { intro, outro, text, confirm, isCancel, cancel, spinner } from '@clack/prompts';
import chalk from 'chalk';
import fs from 'fs-extra';
import { slugify } from '../core/registry.js';
import { loadConfig } from '../core/config.js';
import { logger } from '../core/logger.js';
import { ServerAlreadyExistsError } from '../core/errors.js';
import { resolveEmbeddingModel } from '../lib/embedding.js';
import { createServer } from '../app/services/servers.js';
import { instantiateTemplate } from '../app/services/catalog.js';
import { getTemplate } from '../app/services/catalog.js';
import { promptCredentials, maskCredentials } from '../app/services/credentials.js';
import type { AppProgressEvent } from '../app/events.js';
import { applySourceAuth, parseCliCookie, parseCliHeaders, parseCliSources, sourceLabel } from '../sources/registry.js';
import type { ServerDefinition, SourceDefinition } from '../sources/types.js';
import {
  printTitle, printSection, printCommand, printDetails, printJson, truncate, ui, parseOption,
} from '../ui/format.js';

// ── CLI parsing helpers ───────────────────────────────────────────────────────

/**
 * Transforms `hoolix install <templateId> [positional-values...] [--name <name>] [flags]`
 * into a create-compatible args array with explicit `--template` and `--input` flags.
 * Exits with an error if the template is unknown.
 */
async function normalizeInstallArgs(args: string[], json: boolean): Promise<string[]> {
  const templateId = args[1];
  if (!templateId || templateId.startsWith('-')) {
    if (json) {
      printJson({ ok: false, error: 'Usage: hoolix install <template-id> [values...] [flags]' });
    } else {
      logger.error('Usage: hoolix install <template-id> [positional-values...] [--name <name>] [--yes]');
      printCommand('hoolix templates list');
    }
    process.exit(1);
  }

  // Collect positional values — non-flag args between templateId and first flag
  const positionals: string[] = [];
  let firstFlagIdx = args.length;
  for (let i = 2; i < args.length; i++) {
    if (args[i].startsWith('-')) { firstFlagIdx = i; break; }
    positionals.push(args[i]);
  }
  const flagArgs = args.slice(firstFlagIdx);

  // Already using explicit --template: pass through unchanged
  if (flagArgs.includes('--template')) return args;

  // Load template early to map positionals to named inputs
  let template: Awaited<ReturnType<typeof getTemplate>>;
  try {
    template = await getTemplate(templateId);
  } catch (e: any) {
    if (json) printJson({ ok: false, error: e?.message || String(e) });
    else { logger.error(e?.message || String(e)); printCommand('hoolix templates list'); }
    process.exit(1);
    return args; // unreachable — satisfies TS
  }

  // Extract --name flag and strip it from flagArgs (name will live at args[1])
  const nameFromFlag = parseOption(flagArgs, '--name');
  const cleanedFlags: string[] = [];
  for (let i = 0; i < flagArgs.length; i++) {
    if (flagArgs[i] === '--name' && i + 1 < flagArgs.length) { i++; continue; }
    cleanedFlags.push(flagArgs[i]);
  }

  // Map positionals → required input names (skip keys already set via --input)
  const existingInputs = parseCliInputs(cleanedFlags);
  const inputFlags: string[] = [];
  if (positionals.length > 0) {
    const requiredInputs = template.inputs.filter((i) => i.required);
    positionals.forEach((val, idx) => {
      const input = requiredInputs[idx];
      if (input && !existingInputs[input.name]) {
        inputFlags.push('--input', `${input.name}=${val}`);
      }
    });
  }

  // docs-rag: positional[0] is the URL (when no --url flag already present)
  const urlFlags: string[] = [];
  if (
    template.kind !== 'mcp-server' &&
    positionals.length > 0 &&
    !cleanedFlags.includes('--url')
  ) {
    urlFlags.push('--url', positionals[0]);
  }

  return [
    'install',
    ...(nameFromFlag ? [nameFromFlag] : []),
    '--template', templateId,
    ...inputFlags,
    ...urlFlags,
    ...cleanedFlags,
  ];
}

function parseCliInputs(args: string[]): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      const sep = args[i + 1].indexOf('=');
      if (sep > 0) {
        inputs[args[i + 1].slice(0, sep)] = args[i + 1].slice(sep + 1);
      }
      i++;
    }
  }
  return inputs;
}

function parseCliCredentials(args: string[]): Record<string, string> {
  const creds: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--credential' && args[i + 1]) {
      const sep = args[i + 1].indexOf('=');
      if (sep > 0) {
        creds[args[i + 1].slice(0, sep)] = args[i + 1].slice(sep + 1);
      }
      i++;
    }
  }
  return creds;
}

async function loadEnvFile(filePath: string): Promise<Record<string, string>> {
  const content = await fs.readFile(filePath, 'utf8');
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sep = trimmed.indexOf('=');
    if (sep <= 0) continue;
    const key = trimmed.slice(0, sep).trim();
    const rawVal = trimmed.slice(sep + 1).trim();
    // Strip surrounding quotes (single or double)
    result[key] = rawVal.replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
}

async function promptTemplateInputs(
  template: Awaited<ReturnType<typeof getTemplate>>,
  provided: Record<string, string>,
  nonInteractive: boolean,
): Promise<Record<string, string>> {
  const result: Record<string, string> = { ...provided };
  for (const input of template.inputs) {
    if (result[input.name]) continue;
    if (!input.required) continue;
    if (nonInteractive) {
      throw new Error(
        `Required input "${input.label}" is missing. Pass --input ${input.name}=<value>.`,
      );
    }
    const raw = await text({
      message: input.label + (input.placeholder ? '' : ''),
      placeholder: input.placeholder ?? '',
      validate: (v) => (v && v.trim().length > 0 ? undefined : `${input.label} is required`),
    });
    if (isCancel(raw)) { cancel('Cancelled'); process.exit(0); }
    result[input.name] = String(raw).trim();
  }
  return result;
}

// ── Main command ──────────────────────────────────────────────────────────────

export async function cmdCreate(args: string[], json: boolean): Promise<void> {
  const isInstall = args[0] === 'install';
  if (isInstall) args = await normalizeInstallArgs(args, json);
  if (!json) intro(chalk.bold(isInstall ? 'hoolix install' : 'hoolix create'));

  let name: string | undefined = args[1];
  if (name?.startsWith('-')) name = undefined; // install mode: name will be prompted
  let url  = '';
  let sources: SourceDefinition[] = [];
  let templateDefinition: ServerDefinition | undefined;
  let templateName: string | undefined;

  const urlIdx = args.indexOf('--url');
  if (urlIdx !== -1 && args[urlIdx + 1]) url = args[urlIdx + 1];
  const templateId = parseOption(args, '--template');
  const repoInput = parseOption(args, '--repo');
  const envFilePath = parseOption(args, '--env-file');
  const force = args.includes('--yes') || args.includes('-y');

  // ── mcp-server kind branch ──────────────────────────────────────────────────
  if (templateId) {
    const template = await getTemplate(templateId).catch(() => null);

    if (template?.kind === 'mcp-server') {
      if (!json) return cmdCreateMcpServer(args, json, name, templateId, template, force, envFilePath);
      // json mode falls through to same logic below
      return cmdCreateMcpServerJson(args, name, templateId, template, envFilePath);
    }
  }

  // ── docs-rag branch (existing, unchanged) ────────────────────────────────────

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

// ── mcp-server create (interactive) ──────────────────────────────────────────

async function cmdCreateMcpServer(
  args: string[],
  _json: boolean,
  nameArg: string | undefined,
  templateId: string,
  template: Awaited<ReturnType<typeof getTemplate>>,
  force: boolean,
  envFilePath: string | undefined,
): Promise<void> {
  // 1. Resolve name
  let name = nameArg;
  if (!name) {
    const nameInput = await text({
      message: 'Server name (human readable)',
      placeholder: `My ${template.name}`,
      validate: (v) => (v && v.length > 1 ? undefined : 'Name is required'),
    });
    if (isCancel(nameInput)) { cancel('Cancelled'); process.exit(0); }
    name = String(nameInput);
  }
  const slug = slugify(name);

  // 2. Collect non-sensitive inputs (e.g. allowedPath, dbPath)
  const cliInputs = parseCliInputs(args);
  const templateInputs = await promptTemplateInputs(template, cliInputs, false);

  // 3. Load env file if provided (supplements process.env for credential auto-detection)
  const envOverrides: Record<string, string> = envFilePath
    ? await loadEnvFile(envFilePath).catch((e: any) => {
        logger.warn(`Could not load --env-file "${envFilePath}": ${e?.message || e}`);
        return {};
      })
    : {};

  // 4. Collect sensitive credentials
  const cliCreds = parseCliCredentials(args);
  const mergedEnv = { ...process.env, ...envOverrides } as NodeJS.ProcessEnv;
  let credentials: Record<string, string> = {};
  try {
    credentials = await promptCredentials(template, {
      provided: cliCreds,
      env: mergedEnv,
      nonInteractive: false,
    });
  } catch (e: any) {
    logger.error(e?.message || String(e));
    process.exit(1);
  }

  // 5. Confirm
  if (!force) {
    const confirmed = await confirm({
      message: `Configure server "${name}" (${slug}) using ${template.name}?`,
    });
    if (isCancel(confirmed) || !confirmed) { cancel('Cancelled'); process.exit(0); }
  }

  // 6. Build definition (inputs baked in)
  let templateDefinition: ServerDefinition;
  try {
    const instantiated = await instantiateTemplate(templateId, templateInputs);
    templateDefinition = instantiated.definition;
  } catch (e: any) {
    logger.error('Failed to build template definition:', e?.message || e);
    process.exit(1);
  }

  // 7. Create (no ingestion spinner needed)
  const s = spinner();
  s.start(`Configuring ${template.name}...`);
  try {
    const created = await createServer({
      name,
      definition: templateDefinition,
      templateId,
      credentials,
      embeddingModel: 'fuse',
      onProgress: (p: AppProgressEvent) => {
        if (p.message) s.message(p.message);
      },
    });
    s.stop(`${ui.success('✓')} Server "${name}" configured`);

    const { meta } = created;
    const maskedCreds = maskCredentials(credentials, template);
    const credRows = Object.entries(maskedCreds).map(
      ([k, v]) => [k, v] as [string, string],
    );

    outro(`${ui.success('✓')} "${name}" is ready`);
    printTitle('Ready', `${template.name} (${templateId})`);
    printDetails([
      ['Slug',      meta.slug],
      ['Kind',      'MCP server'],
      ['Transport', template.server?.transport ?? 'stdio'],
      ['Template',  template.name],
      ...(template.server?.npmPackage ? [['Package', template.server.npmPackage] as [string, string]] : []),
      ...credRows,
      ...Object.entries(templateInputs).map(([k, v]) => [k, v] as [string, string]),
    ]);
    console.log('');
    printSection('Next steps');
    printCommand(`hoolix connect ${meta.slug}`);
    if (template.server?.transport === 'stdio') {
      console.log(`  ${ui.muted('Your client will spawn the server process automatically.')}`);
    }
    console.log('');
    if (template.server?.npmPackage) {
      printSection('Required package (installed by client on first run)');
      console.log(`  ${ui.accent('›')} ${chalk.cyan(`npx -y ${template.server.npmPackage}@latest`)}`);
      console.log('');
    }
  } catch (err: any) {
    s.stop('Configuration failed');
    if (err instanceof ServerAlreadyExistsError) {
      logger.error(`A server with slug "${slug}" already exists. Next: hoolix delete ${slug} --yes`);
    } else {
      logger.error('Failed to configure server:', err?.message || err);
    }
    process.exit(1);
  }
}

// ── mcp-server create (--json) ────────────────────────────────────────────────

async function cmdCreateMcpServerJson(
  args: string[],
  nameArg: string | undefined,
  templateId: string,
  template: Awaited<ReturnType<typeof getTemplate>>,
  envFilePath: string | undefined,
): Promise<void> {
  const force = args.includes('--yes') || args.includes('-y');
  if (!force) {
    printJson({ ok: false, error: 'mcp-server creation requires --yes with --json.' });
    process.exit(1);
  }

  const name = nameArg;
  if (!name) {
    printJson({ ok: false, error: 'Missing server name. Next: hoolix create <name> --template <id> --yes --json.' });
    process.exit(1);
  }
  const slug = slugify(name);

  const envOverrides: Record<string, string> = envFilePath
    ? await loadEnvFile(envFilePath).catch(() => ({}))
    : {};
  const mergedEnv = { ...process.env, ...envOverrides } as NodeJS.ProcessEnv;

  let credentials: Record<string, string> = {};
  try {
    credentials = await promptCredentials(template, {
      provided: parseCliCredentials(args),
      env: mergedEnv,
      nonInteractive: true,
    });
  } catch (e: any) {
    printJson({ ok: false, error: e?.message || String(e), next: `Set required env vars or pass --credential key=value` });
    process.exit(1);
  }

  const cliInputs = parseCliInputs(args);
  // For JSON mode, required inputs must be supplied via --input flags
  for (const input of template.inputs) {
    if (input.required && !cliInputs[input.name]) {
      printJson({ ok: false, error: `Required input "${input.name}" missing. Pass --input ${input.name}=<value>.` });
      process.exit(1);
    }
  }

  let templateDefinition: ServerDefinition;
  try {
    const instantiated = await instantiateTemplate(templateId, cliInputs);
    templateDefinition = instantiated.definition;
  } catch (e: any) {
    printJson({ ok: false, error: e?.message || String(e) });
    process.exit(1);
  }

  try {
    const created = await createServer({
      name,
      definition: templateDefinition,
      templateId,
      credentials,
      embeddingModel: 'fuse',
    });
    const { meta } = created;
    const maskedCreds = maskCredentials(credentials, template);
    printJson({
      ok: true,
      slug: meta.slug,
      name: meta.name,
      kind: 'mcp-server',
      templateId,
      transport: template.server?.transport ?? 'stdio',
      credentialKeys: meta.credentialKeys,
      maskedCredentials: maskedCreds,
      templateInputs: templateDefinition.template?.inputs ?? {},
      next: [`hoolix connect ${meta.slug} --client claude --yes --json`],
    });
  } catch (err: any) {
    printJson({
      ok: false,
      error: err instanceof ServerAlreadyExistsError
        ? `A server with slug "${slug}" already exists.`
        : err?.message || String(err),
      next: err instanceof ServerAlreadyExistsError ? `hoolix delete ${slug} --yes` : undefined,
    });
    process.exit(1);
  }
}
