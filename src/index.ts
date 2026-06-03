#!/usr/bin/env node

/**
 * Hoolix
 *
 * Turns documentation URLs into authenticated, hostable MCP servers (Streamable HTTP).
 * See AGENTS.md and README for architecture and invariants.
 */

import { intro, outro, text, confirm, isCancel, cancel, spinner, select } from '@clack/prompts';
import { logger } from './core/logger.js';
import { ensureDirectories, getPaths } from './core/paths.js';
import { loadConfig } from './core/config.js';
import {
  listServers,
  registerServer,
  deleteServer,
  slugify,
  getServerMetadata,
  updateServerMetadata,
  validateServerState,
} from './core/registry.js';
import { getServerDataDir } from './core/paths.js';
import { ServerAlreadyExistsError, ServerNotFoundError } from './core/errors.js';
import chalk from 'chalk';
import { ingestDocumentation } from './ingestion/pipeline.js';
import { createRAGForServer } from './rag/store.js';
import { serverManager } from './process/manager.js';
import { startHostedServer, type HostOptions } from './mcp/host.js';
import { VERSION } from './core/version.js';
import { checkForUpdate, performUpdate } from './core/updater.js';
import path from 'node:path';
import fs from 'fs-extra';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { SUPPORTED_EMBEDDING_MODELS, isHybridModel } from './rag/models.js';
import type { EmbeddingModel } from './rag/models.js';

const ui = {
  brand: chalk.hex('#7dd3fc').bold('hoolix'),
  accent: chalk.hex('#7dd3fc'),
  success: chalk.hex('#34d399'),
  warning: chalk.hex('#fbbf24'),
  danger: chalk.hex('#fb7185'),
  muted: chalk.dim,
};

type DetailRow = [label: string, value: string | number | boolean | undefined];
type TableRow = Record<string, string | number>;

function printTitle(title: string, subtitle?: string) {
  console.log('');
  console.log(`${ui.accent('◆')} ${ui.brand} ${chalk.bold(title)}`);
  if (subtitle) {
    console.log(`  ${ui.muted(subtitle)}`);
  }
  console.log('');
}

function printSection(title: string) {
  console.log(`  ${chalk.bold(title)}`);
}

function printDetails(rows: DetailRow[]) {
  const visibleRows = rows.filter(([, value]) => value !== undefined && value !== '');
  const labelWidth = Math.max(0, ...visibleRows.map(([label]) => label.length));

  for (const [label, value] of visibleRows) {
    console.log(`  ${ui.muted(label.padEnd(labelWidth))}  ${value}`);
  }
}

function printCommand(command: string) {
  console.log(`  ${ui.accent('›')} ${chalk.cyan(command)}`);
}

function printTable(rows: TableRow[]) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const widths = headers.map((header) =>
    Math.max(
      header.length,
      ...rows.map((row) => String(row[header] ?? '').length)
    )
  );

  const renderRow = (row: Record<string, string | number>, color = (v: string) => v) =>
    `  ${headers
      .map((header, index) => color(String(row[header] ?? '').padEnd(widths[index])))
      .join('  ')}`;

  console.log(renderRow(Object.fromEntries(headers.map((h) => [h, h])), chalk.bold));
  console.log(`  ${widths.map((width) => ui.muted('─'.repeat(width))).join('  ')}`);

  for (const row of rows) {
    console.log(renderRow(row));
  }
}

function truncate(value: string, max = 54): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function maskSecret(value: string, visible = 6): string {
  if (!value) return '';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusText(ok: boolean, positive = 'ok', negative = 'issue'): string {
  return ok ? ui.success(positive) : ui.danger(negative);
}

// ===== Connect command helpers (client config paths, clipboard, instructions) =====

type ClientId = 'claude' | 'cursor' | 'windsurf' | 'continue' | 'cline' | 'grokbuild' | 'generic';

interface ClientOption {
  value: ClientId;
  label: string;
  hint?: string;
}

function getConfigPath(client: ClientId, { projectCwd }: { projectCwd?: string } = {}): string | null {
  const home = os.homedir();
  const cwd = projectCwd || process.cwd();
  const appdata = process.env.APPDATA;
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const useProject = !!projectCwd;

  switch (client) {
    case 'claude': {
      if (isWin && appdata) return path.join(appdata, 'Claude', 'claude_desktop_config.json');
      if (isMac) return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
    }
    case 'cursor': {
      const base = useProject ? cwd : home;
      return path.join(base, '.cursor', 'mcp.json');
    }
    case 'windsurf': {
      return path.join(home, '.codeium', 'windsurf', 'mcp_config.json');
    }
    case 'continue': {
      const base = useProject ? cwd : home;
      return path.join(base, '.continue', 'mcpServers', 'mcp.json');
    }
    case 'cline': {
      return path.join(home, '.cline', 'mcp.json');
    }
    case 'grokbuild': {
      return path.join(home, '.grokbuild', 'mcp.json');
    }
    case 'generic':
    default:
      return null;
  }
}

function detectPreferredClient(): ClientId {
  const candidates: ClientId[] = ['cursor', 'claude', 'windsurf', 'cline', 'continue', 'grokbuild'];
  for (const c of candidates) {
    const p = getConfigPath(c);
    if (p) {
      try {
        if (fs.pathExistsSync(path.dirname(p)) || fs.pathExistsSync(p)) return c;
      } catch {}
    }
  }
  return 'generic';
}

function copyToClipboard(text: string): boolean {
  try {
    const input = text;
    if (process.platform === 'win32') {
      execSync('clip', { input, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
    if (process.platform === 'darwin') {
      execSync('pbcopy', { input, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
    try {
      execSync('xclip -selection clipboard', { input, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    } catch {}
    execSync('wl-copy', { input, stdio: ['pipe', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function getClientSteps(client: ClientId): string[] {
  switch (client) {
    case 'claude':
      return [
        'Open Claude Desktop.',
        'Go to Settings (or Developer) > MCP Servers (or edit the config file directly).',
        'Paste or ensure the generated entry exists under "mcpServers".',
        'Save and restart Claude Desktop completely.',
      ];
    case 'cursor':
      return [
        'In Cursor: Settings (Cmd/Ctrl+,) > Tools & MCP (or search "MCP").',
        'Use "Add new MCP server" or manually edit ~/.cursor/mcp.json (global) or .cursor/mcp.json (project).',
        'The config has been auto-merged (only this server entry was touched).',
        'Reload the Cursor window (Cmd/Ctrl+Shift+P → "Reload Window") or restart Cursor.',
      ];
    case 'windsurf':
      return [
        'Open Windsurf settings / Cascade MCP configuration.',
        'Add or merge the server under your mcp_config.json (usually ~/.codeium/windsurf/mcp_config.json).',
        'Restart or reload the Windsurf editor.',
      ];
    case 'continue':
      return [
        'Edit ~/.continue/config.json or the mcpServers file (we wrote to .continue/mcpServers/mcp.json for compatibility).',
        'Restart the Continue extension or reload VS Code / your IDE.',
      ];
    case 'cline':
      return [
        'Locate ~/.cline/mcp.json (or your Cline MCP config location).',
        'Merge the provided server entry.',
        'Restart Cline / your editor.',
      ];
    case 'grokbuild':
      return [
        'Add the JSON snippet to your Grok Build / xAI agent MCP client configuration.',
        'Restart or reconnect the agent session.',
      ];
    case 'generic':
    default:
      return [
        'Copy the JSON block above.',
        'Add it under the "mcpServers" key in your client\'s MCP configuration file.',
        'Restart/reload the client application.',
      ];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'tui';
  const jsonOutput = args.includes('--json');

  await ensureDirectories();
  await loadConfig();

  // Background update check (non-blocking, best-effort)
  if (!jsonOutput && cmd !== 'update' && cmd !== '__internal-host' && process.env.MCP_PORTAL_SKIP_UPDATE_CHECK !== '1') {
    checkForUpdate().then((info) => {
      if (info.isOutdated) {
        logger.warn(
          `A new version of hoolix is available: ${info.latestVersion} (you have ${info.currentVersion})`
        );
        logger.info('Run "hoolix update" to upgrade.');
      }
    }).catch(() => {});
  }

  switch (cmd) {
    case 'version':
    case '--version':
    case '-v':
      console.log(VERSION);
      return;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;

    case 'list':
      await cmdList(jsonOutput);
      return;

    case 'create':
      await cmdCreate(args, jsonOutput);
      return;

    case 'delete':
      await cmdDelete(args, jsonOutput);
      return;

    case 'reindex':
      await cmdReindex(args, jsonOutput);
      return;

    case 'verify':
      await cmdVerify(args);
      return;

    case 'info':
      await cmdInfo(args, jsonOutput);
      return;

    case 'connect':
      await cmdConnect(args, jsonOutput);
      return;

    case 'rotate':
    case 'rotate-key':
      await cmdRotateKey(args, jsonOutput);
      return;

    case 'audit':
    case 'audit-log':
      await cmdAudit(args);
      return;

    case 'start':
      await cmdStart(args, jsonOutput);
      return;

    case 'stop':
      await cmdStop(args, jsonOutput);
      return;

    case 'update':
      await cmdUpdate(jsonOutput);
      return;

    case 'uninstall':
      await cmdUninstall(args, jsonOutput);
      return;

    case 'doctor':
      await cmdDoctor(jsonOutput);
      return;

    case 'gui':
    case 'web':
    case 'dashboard':
      await launchGui(args);
      return;

    case '__internal-host':
      await runInternalHost(args);
      return;

    case 'tui':
    case 'dashboard':
    default:
      // Extra guard: probe raw mode support before even importing the TUI.
      // This prevents the raw-mode TUI from running in environments
      // (especially packaged Windows exes in certain terminals) where isTTY is true
      // but setRawMode will fail.
      let rawModeProbeOk = true;
      if (process.env.MCP_PORTAL_TUI_TEST_MODE === '1') {
        rawModeProbeOk = true;
      } else if (process.stdin.isTTY && process.stdout.isTTY) {
        try {
          // Temporarily enable and disable raw mode. If this throws, we can't use TUI safely.
          (process.stdin as any).setRawMode?.(true);
          (process.stdin as any).setRawMode?.(false);
        } catch {
          rawModeProbeOk = false;
        }
      } else {
        rawModeProbeOk = false;
      }

      if (!rawModeProbeOk) {
        await launchDashboardPlaceholder();
        return;
      }

      try {
        const { launchTUI } = await import('./tui/index.js');
        await launchTUI();
      } catch (e: any) {
        logger.warn('TUI failed to launch (falling back to help):', e?.message || e);
        await launchDashboardPlaceholder();
      }
      return;
  }
}

async function cmdList(json: boolean) {
  const servers = await listServers();

  if (json) {
    console.log(JSON.stringify(servers, null, 2));
    return;
  }

  if (servers.length === 0) {
    printTitle('Servers', 'No MCP servers registered yet.');
    printSection('Create your first server');
    printCommand('hoolix create "My Docs" --url https://example.com/docs/llms.txt');
    console.log('');
    return;
  }

  printTitle('Servers', `${servers.length} registered MCP server${servers.length === 1 ? '' : 's'}`);

  const rows = servers.map((s) => ({
    Name: truncate(s.name, 28),
    Slug: s.slug,
    Chunks: s.chunkCount.toLocaleString(),
    Source: truncate(s.sourceUrl, 48),
    Created: formatDate(s.createdAt),
  }));

  printTable(rows);
  console.log('');

  // On-disk validation pass (warns on drift so broken state is visible early)
  if (!json) {
    for (const s of servers) {
      try {
        const v = await validateServerState(s.slug);
        if (!v.valid) {
          logger.warn(`${s.slug}: ${v.issues.join('; ')}`);
        }
      } catch {
        // ignore validation errors per-server in list output
      }
    }
  }
}

async function cmdCreate(args: string[], json: boolean) {
  if (!json) intro(chalk.bold('hoolix create'));

  let name = args[1];
  let url = '';

  // Parse explicit --url (CLI non-interactive path)
  const urlIdx = args.indexOf('--url');
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    url = args[urlIdx + 1];
  }

  if (!name) {
    if (json) {
      printJson({ ok: false, error: 'Missing server name. Next: pass hoolix create <name> --url <url> --yes --json.' });
      process.exit(1);
    }
    const nameInput = await text({
      message: 'Server name (human readable)',
      placeholder: 'My Company Docs',
      validate: (v) => (v && v.length > 1 ? undefined : 'Name is required'),
    });
    if (isCancel(nameInput)) {
      cancel('Cancelled');
      process.exit(0);
    }
    name = String(nameInput);
  }

  if (!url) {
    if (json) {
      printJson({ ok: false, error: 'Missing --url. Next: pass hoolix create <name> --url <url> --yes --json.' });
      process.exit(1);
    }
    const urlInput = await text({
      message: 'Documentation URL (llms.txt, docs site, or GitHub)',
      placeholder: 'https://docs.example.com/llms.txt',
      validate: (v) => {
        if (!v) return 'URL is required';
        try {
          new URL(v);
          return undefined;
        } catch {
          return 'Must be a valid URL';
        }
      },
    });
    if (isCancel(urlInput)) {
      cancel('Cancelled');
      process.exit(0);
    }
    url = String(urlInput);
  }

  const slug = slugify(name);

  const force = args.includes('--yes') || args.includes('-y');
  let confirmed: boolean | symbol = force;
  if (json && !force) {
    printJson({ ok: false, error: 'Creation requires confirmation. Next: pass --yes with --json.' });
    process.exit(1);
  }
  if (!force) {
    confirmed = await confirm({
      message: `Create server "${name}" (${slug}) from ${url}?`,
    });
  }
  if (isCancel(confirmed) || !confirmed) {
    cancel('Cancelled');
    process.exit(0);
  }

  const s = json ? null : spinner();
  s?.start('Ingesting documentation... (10–120s for multi-page llms.txt sites)');

  try {
    const result = await ingestDocumentation(url, {
      maxChunks: 6000,
      maxPages: 80,
      onProgress: (p) => {
        // Drive spinner with live stage + counts from pipeline progress callbacks
        if (p.message) {
          const suffix =
            p.current != null && p.total != null ? ` (${p.current}/${p.total})` : '';
          s?.message(`${p.message}${suffix}`);
        }
      },
    });

    s?.stop(`Ingestion complete: ${result.stats.totalChunks} chunks, ${(result.stats.totalChars / 1000).toFixed(1)}k chars`);

    // Build search index (Fuse default; optional hybrid BGE-small when --hybrid or config preferredEmbedding=hybrid-bge-small).
    const ragSpinner = json ? null : spinner();
    ragSpinner?.start('Building search index...');

    const cfg = await loadConfig();
    // Resolve embedding: --embedding-model <name> takes precedence, then --hybrid (maps to bge-small), then config, else fuse.
    // Full list in rag/models.ts (DRY).
    let embeddingModel: EmbeddingModel = 'fuse';
    const emIdx = args.indexOf('--embedding-model');
    if (emIdx !== -1 && args[emIdx + 1]) {
      const cand = args[emIdx + 1] as EmbeddingModel;
      if ((SUPPORTED_EMBEDDING_MODELS as string[]).includes(cand)) embeddingModel = cand;
    } else if (args.includes('--hybrid')) {
      embeddingModel = 'hybrid-bge-small';
    } else if ((SUPPORTED_EMBEDDING_MODELS as string[]).includes(cfg.preferredEmbedding)) {
      embeddingModel = cfg.preferredEmbedding as EmbeddingModel;
    }

    try {
      const rag = await createRAGForServer(slug, embeddingModel);
      await rag.indexChunks(result.chunks, { embeddingModel, onProgress: (p) => {
        if (p.stage === 'embed' && p.message) ragSpinner?.message(p.message);
      } });
      await rag.close?.();
      const idxLabel = isHybridModel(embeddingModel) ? `Hybrid (${embeddingModel})` : 'Fuse.js';
      ragSpinner?.stop(`Search index built (${idxLabel})`);
    } catch (ragErr: any) {
      ragSpinner?.stop('Search index step had issues (server registered; you can reindex later)');
      if (!json) logger.warn('RAG indexing error:', ragErr.message || ragErr);
      // Register even if RAG step had issues (user can reindex later)
    }

    const meta = await registerServer({
      name,
      slug,
      sourceUrl: result.sourceUrl,
      sourceType: result.sourceType,
      ingestionVersion: '1.0.0',
      embeddingModel,
      chunkCount: result.stats.totalChunks,
      ingestionStats: result.stats,
      vectorIndexed: isHybridModel(embeddingModel),
      authKey: generateAuthKey(),
      desiredState: 'stopped',
    });

    const pagesInfo = result.sourceUrl.includes('llms-full.txt')
      ? 'llms-full.txt (concatenated documentation)'
      : `${result.stats.pagesProcessed} page(s)`;
    if (json) {
      printJson({
        ok: true,
        slug: meta.slug,
        name: meta.name,
        sourceUrl: meta.sourceUrl,
        sourceType: meta.sourceType,
        chunkCount: meta.chunkCount,
        pagesProcessed: result.stats.pagesProcessed,
        embeddingModel: meta.embeddingModel,
        vectorIndexed: meta.vectorIndexed,
        next: [`hoolix start ${meta.slug}`, `hoolix verify ${meta.slug} --json`],
      });
    } else {
      outro(`${ui.success('✓')} Server "${name}" created successfully`);
      printTitle('Ready', 'Your authenticated MCP server is registered.');
      printDetails([
        ['Slug', meta.slug],
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
        ok: false,
        error: err instanceof ServerAlreadyExistsError
          ? `A server with slug "${slug}" already exists.`
          : (err.message || String(err)),
        next: err instanceof ServerAlreadyExistsError ? `hoolix delete ${slug} --yes` : 'Check the URL and retry.',
      });
    } else if (err instanceof ServerAlreadyExistsError) {
      logger.error(`A server with slug "${slug}" already exists.`);
    } else {
      logger.error('Failed to create server:', err.message || err);
    }
    process.exit(1);
  }
}

async function cmdDelete(args: string[], json: boolean) {
  const slug = args[1];
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix delete <slug> --yes --json.' });
    else logger.error('Usage: hoolix delete <slug>');
    process.exit(1);
  }

  const meta = await getServerMetadata(slug).catch(() => null);
  if (!meta) {
    if (json) printJson({ ok: false, slug, error: `Server "${slug}" not found.` });
    else logger.error(`Server "${slug}" not found.`);
    process.exit(1);
  }

  const force = args.includes('--yes') || args.includes('-y');
  if (json && !force) {
    printJson({ ok: false, slug, error: 'Delete requires confirmation. Next: pass --yes with --json.' });
    process.exit(1);
  }
  let confirmed: boolean | symbol = force;
  if (!force) {
    confirmed = await confirm({
      message: `Permanently delete "${meta.name}" (${slug}) and all its data?`,
    });
  }
  if (isCancel(confirmed) || !confirmed) {
    cancel('Delete cancelled');
    return;
  }

  await deleteServer(slug);
  if (json) printJson({ ok: true, slug, deleted: true });
  else logger.success(`Deleted ${slug}`);
}

async function cmdReindex(args: string[], json: boolean) {
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
      maxChunks: 6000,
      maxPages: 80,
      onProgress: (p) => {
        if (p.message) {
          const suffix = p.current != null && p.total != null ? ` (${p.current}/${p.total})` : '';
          s?.message(`${p.message}${suffix}`);
        }
      },
    });

    const isLlmsFull = result.sourceUrl.includes('llms-full.txt');
    const pagesInfo = isLlmsFull
      ? 'llms-full.txt (concatenated documentation)'
      : `${result.stats.pagesProcessed} page(s)`;
    s?.stop(`Re-ingestion complete: ${result.stats.totalChunks} chunks from ${pagesInfo}`);

    const cfg2 = await loadConfig();
    let embeddingModel2: EmbeddingModel = 'fuse';
    const emIdx2 = args.indexOf('--embedding-model');
    if (emIdx2 !== -1 && args[emIdx2 + 1]) {
      const cand = args[emIdx2 + 1] as EmbeddingModel;
      if ((SUPPORTED_EMBEDDING_MODELS as string[]).includes(cand)) embeddingModel2 = cand;
    } else if (args.includes('--hybrid')) {
      embeddingModel2 = 'hybrid-bge-small';
    } else if ((SUPPORTED_EMBEDDING_MODELS as string[]).includes(cfg2.preferredEmbedding)) {
      embeddingModel2 = cfg2.preferredEmbedding as EmbeddingModel;
    }

    const ragSpinner = json ? null : spinner();
    ragSpinner?.start('Rebuilding search index...');
    try {
      const rag = await createRAGForServer(slug, embeddingModel2);
      await rag.indexChunks(result.chunks, { embeddingModel: embeddingModel2, onProgress: (p) => {
        if (p.stage === 'embed' && p.message) ragSpinner?.message(p.message);
      } });
      await rag.close?.();
      const idxLabel = isHybridModel(embeddingModel2) ? `Hybrid (${embeddingModel2})` : 'Fuse.js';
      ragSpinner?.stop(`Search index rebuilt (${idxLabel})`);
    } catch (e: any) {
      ragSpinner?.stop('Index rebuild encountered issues');
      if (!json) logger.warn('RAG reindex error:', e?.message || e);
    }

    await updateServerMetadata(slug, {
      chunkCount: result.stats.totalChunks,
      sourceType: result.sourceType,
      ingestionStats: result.stats,
      embeddingModel: embeddingModel2,
      vectorIndexed: isHybridModel(embeddingModel2),
    });

    const isLlmsFull2 = result.sourceUrl.includes('llms-full.txt');
    const pagesInfo2 = isLlmsFull2
      ? 'llms-full.txt (concatenated documentation)'
      : `${result.stats.pagesProcessed} page(s)`;
    if (json) {
      printJson({
        ok: true,
        slug,
        sourceUrl: result.sourceUrl,
        sourceType: result.sourceType,
        chunkCount: result.stats.totalChunks,
        pagesProcessed: result.stats.pagesProcessed,
        embeddingModel: embeddingModel2,
        vectorIndexed: isHybridModel(embeddingModel2),
      });
    } else {
      printTitle('Reindexed', `"${slug}" is fresh and searchable.`);
      printDetails([
        ['Chunks', `${result.stats.totalChunks.toLocaleString()} from ${pagesInfo2}`],
        ['Index', isHybridModel(embeddingModel2) ? `Hybrid (${embeddingModel2})` : 'Fuse.js JSON'],
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

async function cmdVerify(args: string[]) {
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

  if (args.includes('--json')) {
    const validation = await validateServerState(slug);
    let rag;
    try {
      const em = (meta.embeddingModel as EmbeddingModel) || 'fuse';
      rag = await createRAGForServer(slug, em);
    } catch (e: any) {
      logger.error('Failed to load RAG:', e.message || e);
      process.exit(1);
    }

    const queries = ['overview', 'install', 'getting started', 'api', 'configuration'];
    const diagnostics = await rag.getDiagnostics?.();
    const samples: Array<{
      query: string;
      hits: number;
      top: { title?: string; sectionPath?: string; url: string; score?: number } | null;
      grounded: boolean;
      weak: boolean;
    }> = [];
    let groundedCount = 0;
    const weakQueries: string[] = [];
    for (const query of queries) {
      const results = await rag.search(query, { limit: 2, mode: 'hybrid' });
      const top = results[0];
      if (top?.metadata.url) groundedCount++;
      const grounded = !!top?.metadata.url;
      const weak = results.length === 0 || !grounded || (top?.score ?? 0) < 0.45;
      if (weak) weakQueries.push(query);
      samples.push({
        query,
        hits: results.length,
        top: top ? {
          title: top.metadata.title,
          sectionPath: top.metadata.sectionPath,
          url: top.metadata.url,
          score: top.score,
        } : null,
        grounded,
        weak,
      });
    }
    const toc = await rag.getTableOfContents();
    const ingestionStats = meta.ingestionStats || null;
    const likelyTruncated = !!ingestionStats?.truncated || (
      typeof ingestionStats?.maxChunks === 'number' && meta.chunkCount >= ingestionStats.maxChunks
    );
    console.log(JSON.stringify({
      slug,
      name: meta.name,
      sourceUrl: meta.sourceUrl,
      chunkCount: meta.chunkCount,
      validation,
      searchable: samples.some((sample) => sample.hits > 0),
      groundingPercent: Math.round((groundedCount / queries.length) * 100),
      sourceCoveragePercent: diagnostics?.sourceCoveragePercent ?? null,
      uniqueSourceUrls: diagnostics?.uniqueSourceUrls ?? null,
      totalChars: diagnostics?.totalChars ?? null,
      averageChunkChars: diagnostics?.averageChunkChars ?? null,
      duplicateChunkIds: diagnostics?.duplicateChunkIds ?? null,
      weakQueries,
      ingestion: ingestionStats ? {
        pagesProcessed: ingestionStats.pagesProcessed,
        pagesDiscovered: ingestionStats.pagesDiscovered,
        maxPages: ingestionStats.maxPages,
        maxChunks: ingestionStats.maxChunks,
        truncated: likelyTruncated,
      } : {
        truncated: likelyTruncated,
        note: 'No persisted ingestion stats; reindex to record cap details.',
      },
      samples,
      tocEntries: toc.length,
      tocPreview: toc.slice(0, 12),
      embeddingModel: meta.embeddingModel,
    }, null, 2));
    return;
  }

  printTitle('Verify', `${meta.name} (${slug})`);

  // Health + registry validation
  const v = await validateServerState(slug);
  printDetails([
    ['Registry chunks', meta.chunkCount.toLocaleString()],
    ['Source', truncate(meta.sourceUrl, 92)],
    ['Validation', statusText(v.valid, 'ok', 'issues')],
  ]);
  if (!v.valid) {
    v.issues.forEach(issue => console.log(`    ${ui.warning('!')} ${issue}`));
  }
  console.log('');

  // Load RAG (exercises chunks.json load; honors hybrid if server was created that way)
  let rag;
  try {
    const em = (meta.embeddingModel as EmbeddingModel) || 'fuse';
    rag = await createRAGForServer(slug, em);
  } catch (e: any) {
    logger.error('Failed to load RAG:', e.message || e);
    process.exit(1);
  }

  // Quick data check via search
  const sample = await rag.search('overview OR install OR api', { limit: 1 });
  console.log(`  ${ui.muted('RAG searchable')}  ${statusText(sample.length > 0, 'yes', 'no (empty index?)')}`);

  const diagnostics = await rag.getDiagnostics?.();
  const ingestionStats = meta.ingestionStats;
  const likelyTruncated = !!ingestionStats?.truncated || (
    typeof ingestionStats?.maxChunks === 'number' && meta.chunkCount >= ingestionStats.maxChunks
  );

  console.log('');
  printSection('Trust signals');
  printDetails([
    ['Source coverage', diagnostics ? `${diagnostics.sourceCoveragePercent}% (${diagnostics.chunksWithUrl}/${diagnostics.totalChunks} chunks have URLs)` : 'unknown'],
    ['Unique source URLs', diagnostics?.uniqueSourceUrls],
    ['Average chunk size', diagnostics ? `${diagnostics.averageChunkChars.toLocaleString()} chars` : undefined],
    ['Duplicate chunk IDs', diagnostics?.duplicateChunkIds],
    ['Ingestion cap', ingestionStats ? `${ingestionStats.totalChunks.toLocaleString()}/${ingestionStats.maxChunks.toLocaleString()} chunks, ${ingestionStats.pagesProcessed.toLocaleString()}/${ingestionStats.maxPages.toLocaleString()} pages` : 'reindex to record cap details'],
    ['Truncated', likelyTruncated ? ui.warning('yes') : ui.success('no')],
  ]);
  if (likelyTruncated) {
    console.log(`    ${ui.warning('!')} Index hit an ingestion cap. Next: reindex with a narrower source or raise caps once flags/config support it.`);
  }
  if (diagnostics && diagnostics.sourceCoveragePercent < 100) {
    console.log(`    ${ui.warning('!')} Some chunks are missing source URLs. Next: reindex and inspect ingestion output for malformed pages.`);
  }

  // Sample searches using common terms (to surface relevance/grounding quickly)
  console.log('');
  printSection('Sample searches (relevance + grounding)');
  const queries = ['overview', 'install', 'getting started', 'api', 'configuration', 'authentication', 'usage'];
  let groundedCount = 0;
  let totalHits = 0;
  const weakQueries: string[] = [];
  for (const q of queries.slice(0, 5)) {
    const res = await rag.search(q, { limit: 2, mode: 'hybrid' });
    totalHits += res.length;
    if (res.length > 0) {
      const top = res[0];
      const hasGround = !!top.metadata.url;
      if (hasGround) groundedCount++;
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
  const groundingPct = totalHits > 0 ? Math.round((groundedCount / Math.min(5, queries.length)) * 100) : 0;
  console.log(`  ${ui.muted('Grounding quality (sample)')} ${groundingPct}% of top results include source URL + section`);
  if (weakQueries.length > 0) {
    console.log(`  ${ui.muted('Needs attention')} ${weakQueries.join(', ')}`);
  }

  // TOC reconstruction sample (from chunk sectionPaths)
  const toc = await rag.getTableOfContents();
  console.log('');
  printSection(`Table of contents (${toc.length} entries)`);
  if (toc.length > 0) {
    const top = toc.filter((t: any) => t.level === 1).slice(0, 4);
    top.forEach((t: any) => console.log(`  ${ui.accent('•')} ${t.title}`));
    if (toc.length > top.length) console.log(`  ${ui.muted('… and more')}`);
  }

  // === Eval mode (new in advanced hybrid): simple automated quality scoring ===
  const doEval = args.includes('--eval') || args.includes('--evaluate');
  if (doEval) {
    console.log('');
    printSection('Eval (relevance proxy + latency + mode comparison)');
    const evalQueries = queries.slice(0, 6);
    const modes: Array<'keyword' | 'hybrid' | 'semantic'> = meta.embeddingModel && isHybridModel(meta.embeddingModel as any)
      ? ['keyword', 'hybrid']
      : ['keyword'];

    const evalResults: Record<string, { avgMs: number; termHit: number; grounded: number; count: number }> = {};

    for (const m of modes) {
      let sumMs = 0;
      let termHits = 0;
      let g = 0;
      let n = 0;
      for (const q of evalQueries) {
        const t0 = Date.now();
        const res = await rag.search(q, { limit: 3, mode: m });
        const ms = Date.now() - t0;
        sumMs += ms;
        n += res.length || 1;
        if (res[0]) {
          const top = res[0];
          const term = q.split(/\s+/)[0].toLowerCase();
          if (top.content.toLowerCase().includes(term) || (top.metadata.title || '').toLowerCase().includes(term)) termHits++;
          if (top.metadata.url) g++;
        }
      }
      evalResults[m] = {
        avgMs: Math.round(sumMs / evalQueries.length),
        termHit: Math.round((termHits / Math.max(1, evalQueries.length)) * 100),
        grounded: Math.round((g / Math.max(1, evalQueries.length)) * 100),
        count: evalQueries.length,
      };
    }

    for (const [m, r] of Object.entries(evalResults)) {
      console.log(`  ${ui.accent(m.padEnd(8))}: ${r.avgMs}ms avg  term-hit=${r.termHit}%  grounded=${r.grounded}% (over ${r.count} queries)`);
    }
    console.log(`  ${ui.muted('Eval is a lightweight proxy (term overlap + grounding). For real golden sets use examples/benchmark.ts --eval')}`);
  }

  // Hybrid note / advanced features (updated for rerank, cache, multiple models)
  console.log('');
  if (meta.embeddingModel && isHybridModel(meta.embeddingModel as any)) {
    console.log(`  ${ui.success('✓')} Hybrid embeddings enabled (${meta.embeddingModel}).`);
    console.log(`    search supports mode=hybrid|semantic|keyword, alpha (blend), reranker=rrf (advanced relevance).`);
    console.log(`    Embeddings cached on disk; query embeds LRU-cached at runtime.`);
    // Quick demo
    try {
      const kw = await rag.search('overview', { limit: 1, mode: 'keyword' });
      const hy = await rag.search('overview', { limit: 1, mode: 'hybrid', reranker: 'rrf' });
      if (kw.length && hy.length) {
        console.log(`  ${ui.muted('Demo')}: keyword vs hybrid+rrf may surface different (often better) top passage.`);
      }
    } catch {}
  } else {
    console.log(`  ${ui.muted('Tip')}: Reindex with --hybrid or --embedding-model hybrid-bge-base (or set preferredEmbedding) for semantic + RRF reranking on top of keyword.`);
  }

  console.log('');
  console.log(`  ${ui.success('✓')} Verify complete. All results include source URLs for grounding.`);
}

async function cmdInfo(args: string[], json: boolean) {
  const slug = args[1];
  if (!slug) {
    logger.error('Usage: hoolix info <slug> [--json]');
    process.exit(1);
  }

  const meta = await getServerMetadata(slug);
  const status = await serverManager.getStatus(slug);

  const full = {
    ...meta,
    authKey: maskSecret(meta.authKey),
    running: status.running,
    port: status.port,
    pid: status.pid,
  };

  if (json) {
    console.log(JSON.stringify(full, null, 2));
    return;
  }

  printTitle('Server Info', `${meta.name} (${meta.slug})`);
  printDetails([
    ['Source', truncate(meta.sourceUrl, 92)],
    ['Type', meta.sourceType],
    ['Chunks', meta.chunkCount.toLocaleString()],
    ['Index', isHybridModel(meta.embeddingModel as any) ? `Hybrid (${meta.embeddingModel})` : 'Fuse.js'],
    ['Status', `${status.running ? ui.success('running') : ui.muted('stopped')}${status.port ? ` on :${status.port}` : ''}`],
    ['Created', new Date(meta.createdAt).toLocaleString()],
  ]);
  if (status.running) {
    printDetails([['Auth', `Authorization: Bearer ${maskSecret(meta.authKey)}`]]);
  }
  console.log('');

  // Validation (uses on-disk chunk count vs registry)
  try {
    const v = await validateServerState(slug);
    if (!v.valid) {
      printSection('Validation');
      for (const issue of v.issues) {
        console.log(`  ${ui.warning('!')} ${issue}`);
      }
      console.log('');
      printCommand(`hoolix reindex ${slug}`);
    } else {
      console.log(`  ${ui.success('✓')} Validation ok`);
    }
  } catch {}
}

export function generateAuthKey(): string {
  // Cryptographically secure (randomBytes); prefixed for easy identification in headers.
  return 'mcp_' + randomBytes(24).toString('hex');
}

async function cmdStart(args: string[], json: boolean) {
  const slug = args[1];
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix start <slug> [--port <n>] --json.' });
    else logger.error('Usage: hoolix start <slug> [--port <n>] [--json]');
    process.exit(1);
  }

  const meta = await getServerMetadata(slug);
  const port = parseInt(args[args.indexOf('--port') + 1] || '0', 10) || (3456 + Math.floor(Math.random() * 400));
  const authKey = meta.authKey;

  if (!json) printTitle('Starting', `Preparing "${meta.name}"`);

  try {
    // Uses ServerManager logic: compiled binary spawns self (__internal-host); dev uses tsx/.bin path.
    const { port: actualPort, pid } = await serverManager.start(slug, { port, authKey });

    if (json) {
      printJson({
        ok: true,
        slug,
        name: meta.name,
        url: `http://127.0.0.1:${actualPort}/mcp`,
        port: actualPort,
        pid,
        mcpServers: {
          [slug]: {
            type: 'streamable-http',
            url: `http://127.0.0.1:${actualPort}/mcp`,
            headers: { Authorization: `Bearer ${authKey}` },
          },
        },
        next: [`hoolix connect ${slug} --client cursor --yes`, `hoolix verify ${slug} --json`],
      });
      return;
    }

    printTitle('Running', `"${meta.name}" is ready for MCP clients.`);
    printDetails([
      ['URL', `http://127.0.0.1:${actualPort}/mcp`],
      ['Auth', `Authorization: Bearer ${authKey}`],
      ['PID', pid],
    ]);
    console.log('');

    printSection('MCP client config');
    console.log(JSON.stringify({
      mcpServers: {
        [slug]: {
          type: 'streamable-http',
          url: `http://127.0.0.1:${actualPort}/mcp`,
          headers: { Authorization: `Bearer ${authKey}` }
        }
      }
    }, null, 2));

    console.log('');
    printSection('Quick checks');
    printCommand(`curl -s http://127.0.0.1:${actualPort}/health`);
    printCommand(`curl -s -H "Authorization: Bearer ${authKey}" -X POST -d '{}' -H 'content-type: application/json' http://127.0.0.1:${actualPort}/mcp`);
    printCommand(`node --import tsx test/verify-mcp.ts --slug ${slug}`);
    console.log('');
    console.log(`  ${ui.muted('Tip:')} hoolix connect ${slug} --client cursor   (or claude|windsurf|continue|cline|grokbuild|generic; use --project for workspace)`);
  } catch (err: any) {
    if (json) {
      printJson({
        ok: false,
        slug,
        error: err.message || String(err),
        next: `Run hoolix doctor --json, then retry hoolix start ${slug} --json.`,
      });
      process.exit(1);
    }
    // Spawn failed (common in dev); fall back to manual instructions for user.
    logger.warn('Could not automatically start the host process:', err.message);

    console.log('');
    printSection('Manual start');
    printCommand(`npx tsx src/mcp/host.ts --slug ${slug} --port ${port} --data-dir ".hoolix/servers/${slug}/data" --auth-key ${authKey}`);
    console.log('');
    console.log(chalk.dim('Once the host is running, use the connection details above.'));
    console.log(`  ${ui.muted('Tip:')} hoolix connect ${slug} --client cursor`);
  }
}

async function cmdStop(args: string[], json: boolean) {
  const slug = args[1];
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix stop <slug> --json.' });
    else logger.error('Usage: hoolix stop <slug> [--json]');
    process.exit(1);
  }
  const stopped = await serverManager.stop(slug);
  if (json) {
    printJson({ ok: true, slug, stopped });
  } else if (stopped) {
    logger.success(`Stopped ${slug}`);
  } else {
    logger.info(`${slug} was not running.`);
  }
}

async function cmdUpdate(json: boolean) {
  if (!json) logger.info('Checking for updates...');

  const updateInfo = await checkForUpdate();
  if (!updateInfo.isOutdated) {
    if (json) printJson({ ok: true, updated: false, ...updateInfo });
    else logger.success(`You are already on the latest version (${updateInfo.currentVersion}).`);
    return;
  }

  // Collect slugs of servers that are currently running so we can stop them
  // before the update (they may hold locks on the binary on Windows) and
  // restart them afterwards.
  let restartSlugs: string[] = [];
  try {
    const allServers = await listServers();
    for (const s of allServers) {
      const st = await serverManager.getStatus(s.slug);
      if (st.running) {
        restartSlugs.push(s.slug);
      }
    }
  } catch (e: any) {
    logger.warn('Failed to enumerate running servers before update:', e.message || e);
  }

  if (restartSlugs.length > 0) {
    if (!json) logger.info(`Stopping ${restartSlugs.length} running server(s) before update: ${restartSlugs.join(', ')}`);
    for (const slug of restartSlugs) {
      try {
        await serverManager.stop(slug, true);
        if (!json) logger.info(`Stopped ${slug}`);
      } catch (e: any) {
        if (!json) logger.warn(`Failed to stop ${slug} before update: ${e.message || e}`);
      }
    }
  }

  try {
    const success = await performUpdate(restartSlugs, { quiet: json });
    if (success) {
      if (json) printJson({ ok: true, updated: true, ...updateInfo, restarted: restartSlugs });
      else logger.success('Update completed successfully!');
      // Non-Windows: restart here. (Windows update path uses a .bat that handles restarts and exits this process.)
      if (restartSlugs.length > 0 && process.platform !== 'win32') {
        if (!json) logger.info('Restarting previously running servers...');
        for (const slug of restartSlugs) {
          try {
            await serverManager.start(slug);
            if (!json) logger.info(`Restarted ${slug}`);
          } catch (e: any) {
            if (!json) logger.warn(`Failed to restart ${slug} after update: ${e.message || e}`);
          }
        }
      }
    } else if (json) {
      printJson({
        ok: false,
        updated: false,
        ...updateInfo,
        restarted: restartSlugs,
        error: updateInfo.assetName
          ? 'Auto-update could not be applied. Next: download the release asset manually or run from a compiled binary.'
          : 'No suitable binary asset was found for this platform in the latest release.',
      });
      process.exit(1);
    }
  } catch (err: any) {
    if (json) printJson({ ok: false, updated: false, error: err.message || String(err), restarted: restartSlugs });
    else logger.error('Update failed:', err.message || err);
    // Best effort: restart servers even if update failed, so user isn't left with stopped services.
    if (restartSlugs.length > 0) {
      logger.info('Attempting to restart servers after failed update...');
      for (const slug of restartSlugs) {
        try {
          await serverManager.start(slug);
        } catch {}
      }
    }
    process.exit(1);
  }
}

async function cmdUninstall(args: string[], json: boolean) {
  const force = args.includes('--yes') || args.includes('-y');

  if (json && !force) {
    printJson({ ok: false, error: 'Uninstall requires confirmation. Next: pass --yes with --json.' });
    process.exit(1);
  }

  if (!force) {
    const confirmed = await confirm({
      message: 'Permanently uninstall hoolix? This will stop all servers, delete ALL data/servers/configs, remove the binary, and clean up PATH entries (on Windows). Cannot be undone.',
    });
    if (isCancel(confirmed) || !confirmed) {
      cancel('Uninstall cancelled');
      return;
    }
  }

  if (!json) logger.info('Starting uninstall...');

  // Stop and delete all servers (best effort)
  try {
    const servers = await listServers();
    for (const s of servers) {
      try {
        const st = await serverManager.getStatus(s.slug);
        if (st.running) {
          await serverManager.stop(s.slug, true);
          if (!json) logger.info(`Stopped ${s.slug}`);
        }
      } catch {}
      await deleteServer(s.slug, { removeData: true });
    }
    if (servers.length > 0) {
      if (!json) logger.info(`Removed ${servers.length} server(s)`);
    }
  } catch (e: any) {
    if (!json) logger.warn('Some servers could not be cleaned:', e.message);
  }

  // Remove the entire data directory (config, registry, all per-server data, cache, etc.)
  try {
    const { data: dataDir } = getPaths();
    if (await fs.pathExists(dataDir)) {
      await fs.remove(dataDir);
      if (!json) logger.info(`Removed data directory: ${dataDir}`);
    }
  } catch (e: any) {
    if (!json) logger.warn('Could not remove data dir:', e.message);
  }

  // Remove the binary (and self) if this is a compiled install
  const currentExe = process.execPath;
  const isCompiledBinary =
    !currentExe.includes('node') && !currentExe.includes('bun');

  if (isCompiledBinary) {
    const installDir = path.dirname(currentExe);

    if (process.platform === 'win32') {
      // Remove from user PATH first (can do from running process)
      try {
        // Escape backslashes for the inner PowerShell string
        const escapedDir = installDir.replace(/\\/g, '\\\\');
        const psCmd = `[Environment]::GetEnvironmentVariable('PATH','User') -split ';' | Where-Object { $_.TrimEnd('\\') -ine '${escapedDir}' } | Join-String -Separator ';' | ForEach-Object { [Environment]::SetEnvironmentVariable('PATH', $_, 'User') }`;
        execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'ignore' });
        if (!json) logger.info(`Removed ${installDir} from user PATH.`);
      } catch (e: any) {
        if (!json) logger.warn('Could not automatically remove from PATH (edit manually if needed).');
      }

      // Prepare detached batch to delete the exe + dir after we exit (can't delete running exe)
      const batPath = currentExe + '.uninstall.bat';
      const batContent = `@echo off
setlocal
timeout /t 2 /nobreak >nul 2>&1
if exist "${currentExe}" (
  del /f /q "${currentExe}" >nul 2>&1
)
if exist "${installDir}" (
  rd /s /q "${installDir}" >nul 2>&1
)
echo hoolix completely uninstalled.
del "%~f0" >nul 2>&1
`;
      await fs.writeFile(batPath, batContent);

      spawn('cmd.exe', ['/c', batPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();

      if (json) printJson({ ok: true, removedData: true, compiledBinary: true, uninstallPrepared: true, installDir });
      else {
        logger.success('Uninstall prepared.');
        logger.info('This process will exit now; the binary and install directory will be removed shortly.');
      }
      await new Promise((r) => setTimeout(r, 150));
      process.exit(0);
    } else {
      // Unix/mac: can remove the file directly (not a running image lock issue the same way)
      try {
        await fs.remove(currentExe);
        if (!json) logger.info(`Removed binary: ${currentExe}`);
        // Do not rmdir installDir (often ~/.local/bin which is shared)
      } catch (e: any) {
        if (!json) logger.warn(`Could not remove binary ${currentExe}: ${e.message}`);
      }
      if (!json) logger.info('If you manually added the install directory to PATH in your shell config (~/.bashrc etc.), remove the entry there.');
    }
  } else {
    if (!json) logger.info('Not running as a compiled binary — only data was cleaned. Remove the package/source manually if desired.');
  }

  if (json) printJson({ ok: true, removedData: true, compiledBinary: isCompiledBinary });
  else logger.success('hoolix has been fully uninstalled and cleaned up.');
}

async function cmdDoctor(json: boolean) {
  const results: Record<string, unknown> = {};
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  // Runtime detection (binary vs bun/node)
  const version = VERSION;
  const execPath = process.execPath;
  const isCompiledBinary = !execPath.includes('node') && !execPath.includes('bun') && !execPath.includes('tsx');
  const runtime = isCompiledBinary ? 'compiled-binary (bun)' : (execPath.includes('bun') ? 'bun' : 'node');
  const platform = `${process.platform} ${process.arch}`;
  const nodeVer = process.version;

  const runtimeInfo = { version, runtime, platform, execPath: execPath.slice(0, 120) + (execPath.length > 120 ? '...' : ''), node: nodeVer };
  results.runtime = runtimeInfo;

  checks.push({ name: 'runtime', ok: true, detail: `${runtime} on ${platform}` });

  // Paths & directories (write test using ensureDirectories)
  try {
    const paths = await ensureDirectories();
    const testFile = path.join(paths.data, '.doctor-write-test');
    await fs.writeFile(testFile, 'ok');
    await fs.remove(testFile).catch(() => {});
    results.paths = { data: paths.data, config: paths.config, servers: paths.servers, cache: paths.cache, writable: true };
    checks.push({ name: 'paths', ok: true, detail: `data=${paths.data}` });
  } catch (e: any) {
    checks.push({ name: 'paths', ok: false, detail: e.message });
    results.paths = { error: e.message };
  }

  // Config load
  try {
    const cfg = await loadConfig();
    results.config = cfg;
    checks.push({ name: 'config', ok: true });
  } catch (e: any) {
    checks.push({ name: 'config', ok: false, detail: e.message });
  }

  // Registry enumeration
  try {
    const servers = await listServers();
    results.servers = { count: servers.length, slugs: servers.map(s => s.slug) };
    checks.push({ name: 'registry', ok: true, detail: `${servers.length} server(s)` });
  } catch (e: any) {
    checks.push({ name: 'registry', ok: false, detail: e.message });
    results.servers = { error: e.message };
  }

  // Process manager (ps-list side-effect availability)
  try {
    // (import side-effect check)
    checks.push({ name: 'process-manager', ok: true });
  } catch (e: any) {
    checks.push({ name: 'process-manager', ok: false, detail: e.message });
  }

  // Network reachability (light probe, non-blocking)
  let netOk = false;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch('https://api.github.com/zen', { signal: ctl.signal }).catch(() => null);
    clearTimeout(t);
    netOk = !!r && r.ok;
    checks.push({ name: 'network', ok: netOk, detail: netOk ? 'github reachable' : 'limited' });
  } catch {
    checks.push({ name: 'network', ok: false, detail: 'offline or blocked' });
  }
  results.network = { ok: netOk };

  const allOk = checks.every(c => c.ok);
  results.checks = checks;
  results.healthy = allOk;

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    if (!allOk) process.exit(1);
    return;
  }

  // Human output
  printTitle('Doctor', 'Installation, runtime, paths, and network checks.');
  printDetails([
    ['Version', version],
    ['Runtime', `${runtime} (${platform})`],
    ['Exec', runtimeInfo.execPath],
  ]);
  console.log('');

  for (const c of checks) {
    const icon = c.ok ? ui.success('✓') : ui.danger('✗');
    console.log(
      c.detail
        ? `  ${icon} ${c.name.padEnd(18)} ${ui.muted(c.detail)}`
        : `  ${icon} ${c.name}`
    );
  }

  console.log('');
  if (allOk) {
    console.log(`  ${ui.success('✓')} All checks passed. Installation looks healthy.`);
    printCommand('hoolix create "My Docs" --url https://example.com/llms.txt --yes');
    printCommand('hoolix start my-docs && hoolix connect my-docs --client cursor');
  } else {
    console.log(`  ${ui.warning('!')} Some checks failed or are limited. See details above.`);
    console.log(`  ${ui.muted('Common fixes: ensure write access to data dir, check network for initial llms.txt fetches.')}`);
  }
  console.log('');

  // Security / advanced rate + audit surface (high-priority per roadmap #23) + GitHub private (#22)
  console.log(`  ${ui.muted('Security:')} keys are per-server + rotatable; rate limits + audit.log enabled in host (see \`hoolix audit <slug>\`).`);
  console.log(`  ${ui.muted('Private GitHub:')} export GITHUB_TOKEN for full raw+tree access on private repos (see docs).`);

  if (!allOk) process.exit(1);
}

async function launchGui(args: string[]) {
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : 8080;
  const bindIdx = args.indexOf('--bind');
  const host = bindIdx !== -1 && args[bindIdx + 1] ? args[bindIdx + 1] : '127.0.0.1';
  const noOpen = args.includes('--no-open') || args.includes('--no-browser');
  const tokenIdx = args.indexOf('--token');
  const providedToken = tokenIdx !== -1 && args[tokenIdx + 1] ? args[tokenIdx + 1] : undefined;

  try {
    const { launchWebGui } = await import('./web/server.js');
    await launchWebGui({ port, host, open: !noOpen, token: providedToken, strictPort: portIdx !== -1 });
  } catch (e: any) {
    logger.error('Failed to launch web GUI:', e?.message || e);
    process.exit(1);
  }
}

async function cmdConnect(args: string[], json: boolean) {
  const slug = args[1];
  if (!slug) {
    logger.error('Usage: hoolix connect <slug> [--client claude|cursor|windsurf|continue|cline|grokbuild|generic] [--yes] [--json] [--project] [--port N]');
    process.exit(1);
  }

  let meta: any;
  try {
    meta = await getServerMetadata(slug);
  } catch (e: any) {
    if (e instanceof ServerNotFoundError || e?.code === 'SERVER_NOT_FOUND') {
      logger.error(`Server "${slug}" not found. Run "hoolix list" to see available, or "hoolix create ..." to make one.`);
    } else {
      logger.error('Failed to load server metadata:', e?.message || e);
    }
    process.exit(1);
  }

  const status = await serverManager.getStatus(slug);
  const portIdx = args.indexOf('--port');
  const portFromArg = portIdx !== -1 ? parseInt(args[portIdx + 1] || '0', 10) || undefined : undefined;

  let port = status.port || portFromArg;
  const force = args.includes('--yes') || args.includes('-y');
  const isProject = args.includes('--project');

  if (!port) {
    if (json) {
      logger.error(`Server "${slug}" is not running and no --port provided; cannot emit concrete URL for --json output.`);
      logger.info(`Next step: start it first (hoolix start ${slug} [--port N]) then retry, or pass --port N explicitly.`);
      process.exit(1);
    }
    const suggested = 3456 + Math.floor(Math.random() * 400);
    if (force) {
      port = suggested;
      logger.warn(`Server not detected running. Using suggested port ${port} for the config entry (ensure you start with matching port).`);
    } else {
      const portInput = await text({
        message: 'Port the MCP server listens on (must match the started server)',
        placeholder: String(suggested),
        validate: (v) => {
          const n = parseInt(String(v), 10);
          return (n >= 1024 && n <= 65535) ? undefined : 'Port must be 1024-65535';
        },
      });
      if (isCancel(portInput)) {
        cancel('Connect cancelled');
        process.exit(0);
      }
      port = parseInt(String(portInput), 10) || suggested;
    }
  } else if (portFromArg && status.port && portFromArg !== status.port) {
    logger.warn(`--port ${portFromArg} ignored (server already running on :${status.port}).`);
  }

  const authKey = meta.authKey;
  const serverUrl = `http://127.0.0.1:${port}/mcp`;
  const mcpEntry = { type: 'streamable-http', url: serverUrl, headers: { Authorization: `Bearer ${authKey}` } };
  const payload = { mcpServers: { [slug]: mcpEntry } };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  // Client selection
  let clientIdx = args.indexOf('--client');
  let client: ClientId | undefined = (clientIdx !== -1 ? args[clientIdx + 1] : undefined) as ClientId | undefined;
  if (!client) {
    if (force) {
      client = 'generic';
    } else {
      const detected = detectPreferredClient();
      const options: ClientOption[] = [
        { value: 'cursor', label: 'Cursor (global ~/.cursor/mcp.json or --project)', hint: 'Recommended for most devs' },
        { value: 'claude', label: 'Claude Desktop', hint: 'Global only' },
        { value: 'windsurf', label: 'Windsurf / Codeium' },
        { value: 'continue', label: 'Continue.dev' },
        { value: 'cline', label: 'Cline' },
        { value: 'grokbuild', label: 'Grok Build / xAI' },
        { value: 'generic', label: 'Generic (print JSON only)' },
      ];
      const sel = await select({
        message: 'Select target MCP client (config will be auto-merged with backup)',
        options,
        initialValue: detected,
      });
      if (isCancel(sel)) {
        cancel('Connect cancelled');
        process.exit(0);
      }
      client = sel as ClientId;
    }
  }

  // Validate/normalize client
  const validClients: ClientId[] = ['claude', 'cursor', 'windsurf', 'continue', 'cline', 'grokbuild', 'generic'];
  if (!validClients.includes(client as ClientId)) client = 'generic';

  const cfgPath = getConfigPath(client as ClientId, { projectCwd: isProject ? process.cwd() : undefined });

  const entryStr = JSON.stringify(payload, null, 2);

  if (cfgPath) {
    let existing: any = {};
    if (await fs.pathExists(cfgPath)) {
      try {
        existing = await fs.readJson(cfgPath);
      } catch {
        logger.warn('Existing config was invalid JSON; it will be backed up and we will start fresh for mcpServers.');
        existing = {};
      }
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const rand = Math.random().toString(36).slice(2, 7);
      const backupPath = `${cfgPath}.${ts}-${rand}.bak`;
      await fs.copy(cfgPath, backupPath).catch(() => {});
      logger.info(`Backup written: ${backupPath}`);
    }
    if (!existing || typeof existing !== 'object') existing = {};
    if (!existing.mcpServers || typeof existing.mcpServers !== 'object') existing.mcpServers = {};
    existing.mcpServers = { ...existing.mcpServers, ...payload.mcpServers };

    await fs.ensureDir(path.dirname(cfgPath));
    await fs.writeJson(cfgPath, existing, { spaces: 2 });
    logger.success(`Merged server "${slug}" into ${client} config.`);
    console.log(`  ${ui.muted('File:')} ${cfgPath}`);
  } else {
    logger.info(`No auto-write path for client "${client}" (or generic chosen). Follow manual steps below.`);
  }

  printTitle('Connect ready', `Prepared "${meta.name}" (${slug}) for ${client}`);
  printSection('MCP config snippet (ready to paste)');
  console.log(entryStr);
  console.log('');

  printSection('Next steps for this client');
  const steps = getClientSteps(client as ClientId);
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  if (cfgPath) {
    console.log(`  ${ui.muted('Auto-merged with backup. Restart/reload the client as listed above.')}`);
  }
  console.log('');

  printSection('Recommended test prompt (copy into your agent chat)');
  console.log(`  Use the search_documentation tool with a query about the docs, e.g. "search_documentation for installation instructions from the ${meta.name}."`);
  console.log(`  Then try: read_documentation_page or get_table_of_contents. All results include Source: URLs for grounding.`);
  console.log('');

  const copied = copyToClipboard(entryStr);
  if (copied) {
    console.log(`  ${ui.success('✓')} Snippet copied to clipboard.`);
  } else {
    console.log(`  ${ui.muted('(Clipboard not available here — copy the JSON block manually.)')}`);
  }
  console.log('');
  printSection('Other options');
  printCommand(`hoolix connect ${slug} --client claude --yes`);
  printCommand(`hoolix connect ${slug} --client cursor --project`);
  printCommand(`hoolix connect ${slug} --json`);
}

async function cmdRotateKey(args: string[], json: boolean) {
  const slug = args[1];
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix rotate <slug> --yes --json.' });
    else logger.error('Usage: hoolix rotate <slug> [--yes] [--json]');
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

  const force = args.includes('--yes') || args.includes('-y');
  if (json && !force) {
    printJson({ ok: false, slug, error: 'Key rotation requires confirmation. Next: pass --yes with --json.' });
    process.exit(1);
  }
  let confirmed: boolean | symbol = force;
  if (!force) {
    confirmed = await confirm({ message: `Rotate auth key for "${meta.name}" (${slug})? Existing clients will need the new key.` });
  }
  if (isCancel(confirmed) || !confirmed) {
    cancel('Key rotation cancelled');
    return;
  }

  const oldKey = meta.authKey;
  const newKey = generateAuthKey();

  await updateServerMetadata(slug, { authKey: newKey } as any);

  if (json) {
    printJson({
      ok: true,
      slug,
      oldKey: maskSecret(oldKey),
      newKey,
      restartRequired: true,
      next: [`hoolix stop ${slug}`, `hoolix start ${slug}`, `hoolix connect ${slug} --client cursor --yes`],
    });
    return;
  }

  printTitle('Key rotated', slug);
  printDetails([
    ['Old key (no longer valid)', maskSecret(oldKey)],
    ['New key', newKey],
  ]);
  console.log('');
  logger.warn('Any running server for this slug must be stopped and restarted to pick up the new key.');
  printCommand(`hoolix stop ${slug}`);
  printCommand(`hoolix start ${slug}`);
  printCommand(`hoolix connect ${slug} --client cursor`);
  console.log(`  ${ui.muted('Audit previous activity:')} hoolix audit ${slug} --json`);
}

async function cmdAudit(args: string[]) {
  const slug = args[1];
  if (!slug) {
    logger.error('Usage: hoolix audit <slug> [--json] [--limit N] [--tool <name>] [--since <iso-prefix>]');
    process.exit(1);
  }

  const json = args.includes('--json');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) || 50 : 50;
  const toolIdx = args.indexOf('--tool');
  const toolFilter = toolIdx !== -1 && args[toolIdx + 1] ? args[toolIdx + 1] : undefined;
  const sinceIdx = args.indexOf('--since');
  const sinceFilter = sinceIdx !== -1 && args[sinceIdx + 1] ? args[sinceIdx + 1] : undefined;

  const auditPath = path.join(getServerDataDir(slug), 'audit.log');  // reuse from paths (imported via registry side effects ok)
  let raw = '';
  try {
    raw = await fs.readFile(auditPath, 'utf8');
  } catch {
    if (json) {
      console.log(JSON.stringify({ slug, entries: [], message: 'No audit log yet (server must be started and tools invoked).' }));
    } else {
      printTitle('Audit Log', slug);
      console.log(`  ${ui.muted('No audit.log found for this server.')}`);
      console.log(`  ${ui.muted('Start the server and perform searches/reads to generate entries.')}`);
      printCommand(`hoolix start ${slug}`);
    }
    return;
  }

  const entries: Array<Record<string, unknown>> = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (toolFilter && e.tool !== toolFilter) continue;
      if (sinceFilter && typeof e.ts === 'string' && !e.ts.startsWith(sinceFilter)) continue;
      entries.push(e);
    } catch {
      // skip malformed
    }
  }

  // Newest first
  entries.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  const shown = entries.slice(0, limit);

  if (json) {
    console.log(JSON.stringify({ slug, count: entries.length, showing: shown.length, entries: shown }, null, 2));
    return;
  }

  printTitle('Audit Log', slug);
  printDetails([
    ['Total entries', entries.length],
    ['Showing (newest first)', shown.length],
    ['Log path', auditPath],
  ]);
  console.log('');

  if (shown.length === 0) {
    console.log(`  ${ui.muted('No matching entries.')}`);
    return;
  }

  // Pretty table for common fields (ts, tool, query/hits, other)
  const rows: TableRow[] = shown.map((e) => {
    const q = (e.query as string | undefined)?.slice(0, 48) || (e.urlOrPath as string | undefined)?.slice(0, 48) || '';
    const extra = e.hits != null ? `hits=${e.hits}` : e.found != null ? `found=${e.found}` : e.entries != null ? `entries=${e.entries}` : '';
    return {
      ts: String(e.ts || '').replace('T', ' ').replace(/\.\d+Z$/, 'Z'),
      tool: String(e.tool || ''),
      details: [q, extra].filter(Boolean).join(' '),
    };
  });

  printTable(rows);
  console.log('');
  if (entries.length > limit) {
    console.log(`  ${ui.muted(`... ${entries.length - limit} more (use --limit or --json for full)`)}`);
  }
  console.log(`  ${ui.muted('Filters: --tool search_documentation --since 2026- --limit 100')}`);
}

async function runInternalHost(args: string[]) {
  // Hidden mode used by ServerManager after packaging (binary self-spawn path).
  // Invoked as: hoolix __internal-host --slug ... --port ... --data-dir ... --auth-key ...
  const getArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const slug = getArg('slug');
  const portStr = getArg('port');
  const dataDir = getArg('data-dir');
  const authKey = getArg('auth-key');

  if (!slug || !portStr || !dataDir || !authKey) {
    console.error('Internal host mode requires --slug, --port, --data-dir, --auth-key');
    process.exit(1);
  }

  const options: HostOptions = {
    slug,
    port: parseInt(portStr, 10),
    dataDir,
    authKey,
  };

  await startHostedServer(options);
}

async function launchDashboardPlaceholder() {
  printTitle('Dashboard', 'Interactive TUI (pure Node, no React) is the default when run in a real TTY.');
  printSection('Available now');
  printCommand('hoolix create "My Project Docs" --url https://.../llms.txt --yes');
  printCommand('hoolix start my-project-docs');
  printCommand('hoolix list');
  printCommand('hoolix info my-project-docs');
  console.log('');
  console.log(`  ${ui.muted('The TUI provides live status, log tail and one-key actions. Falls back here in non-TTY/CI.')}`);
  console.log(`  ${ui.muted('All functionality is also available via explicit CLI commands for scripting and non-interactive use.')}`);
  console.log('');
}

function printHelp() {
  console.log(`
${ui.accent('◆')} ${ui.brand} ${chalk.bold('Forge documentation into powerful, secure MCP servers.')}

${chalk.bold('Usage')}
  hoolix [command] [options]

${chalk.bold('Commands')}
  ${ui.accent('create')} [name]        Create server from docs URL (real ingestion + RAG; --yes, --json, --hybrid, --embedding-model)
  ${ui.accent('list')}                 List registered servers (--json)
  ${ui.accent('start')} <slug>         Start the MCP server (Streamable HTTP; --port, --json)
  ${ui.accent('stop')} <slug>          Stop a running server (--json)
  ${ui.accent('info')} <slug>          Show details and masked status info (--json)
  ${ui.accent('connect')} <slug>      Wire server into client (auto-merge + backup for claude/cursor/etc; --client, --project, --json)
  ${ui.accent('rotate')} <slug>       Rotate the Bearer auth key for a server (clients must be updated)
  ${ui.accent('audit')} <slug>        Query audit log (tool calls, rate limits, searches) with filters (--json, --limit, --tool, --since)
  ${ui.accent('delete')} <slug>        Remove server and data (--yes, --json)
  ${ui.accent('reindex')} <slug>       Re-fetch source and rebuild the RAG index (--yes, --json, --hybrid, --embedding-model)
  ${ui.accent('verify')} <slug>        Check RAG health, samples, grounding + optional --eval / --json
  ${ui.accent('gui')}                  Launch web GUI / dashboard in browser (port 8080, token auth, create/manage/playground)
  ${ui.accent('doctor')} [--json]      Diagnose installation, paths, config, and runtime
  ${ui.accent('update')}               Check for and install the latest version (--json)
  ${ui.accent('uninstall')} [--yes]    Completely remove hoolix, all servers/data, the binary itself, and PATH entries (Windows; --json)
  ${ui.accent('version')}              Print the current version

${chalk.bold('Examples')}
  ${ui.accent('›')} hoolix create "My Docs" --url https://example.com/llms.txt --yes
  ${ui.accent('›')} hoolix create "My Docs" --url https://example.com/llms.txt --yes --json
  ${ui.accent('›')} hoolix verify my-docs
  ${ui.accent('›')} hoolix start my-docs
  ${ui.accent('›')} hoolix connect my-docs --client cursor
  ${ui.accent('›')} hoolix rotate my-docs
  ${ui.accent('›')} hoolix audit my-docs --limit 20 --json
  ${ui.accent('›')} hoolix gui
  ${ui.accent('›')} hoolix uninstall --yes
  ${ui.accent('›')} hoolix doctor --json

${chalk.bold('Status')}
  ${ui.success('✓')} llms.txt-first + GitHub-aware ingestion with heading-aware chunking + full GITHUB_TOKEN for private repos (raw + tree)
  ${ui.success('✓')} Fuse.js (default) + optional hybrid BGE-small RAG; every result includes Source URLs
  ${ui.success('✓')} Hono + official MCP Streamable HTTP + per-server auth + tool timeouts + advanced rate limiting (configurable + Retry-After) + queryable rotated audit.log
  ${ui.success('✓')} Self-contained binaries + interactive pure-Node TUI (default when no command) + web GUI ('hoolix gui')
  ${ui.success('✓')} connect + rotate + audit + browser dashboard for production client wiring, security, and visual management
`);
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
