import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { execSync } from 'node:child_process';
import { text, select, isCancel, cancel } from '@clack/prompts';
import { getServerMetadata } from '../core/registry.js';
import { serverManager } from '../process/manager.js';
import { logger } from '../core/logger.js';
import { ServerNotFoundError } from '../core/errors.js';
import { loadCredentials } from '../app/services/credentials.js';
import { interpolateRunConfig } from '../app/services/credentials.js';
import { getTemplate } from '../app/services/catalog.js';
import {
  printTitle, printSection, printCommand, printJson, ui,
} from '../ui/format.js';

// ── Client registry ───────────────────────────────────────────────────────────

export type ClientId =
  | 'claude'
  | 'claude-code'
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'continue'
  | 'cline'
  | 'codex'
  | 'grokbuild'
  | 'generic';

export const ALL_CLIENTS: ClientId[] = [
  'claude', 'claude-code', 'cursor', 'vscode',
  'windsurf', 'continue', 'cline', 'codex', 'grokbuild', 'generic',
];

interface ClientOption {
  value: ClientId;
  label: string;
  hint?: string;
}

export function getConfigPath(client: ClientId, { projectCwd }: { projectCwd?: string } = {}): string | null {
  const home     = os.homedir();
  const cwd      = projectCwd || process.cwd();
  const appdata  = process.env.APPDATA;
  const isWin    = process.platform === 'win32';
  const isMac    = process.platform === 'darwin';
  const useProject = !!projectCwd;

  switch (client) {
    case 'claude': {
      if (isWin && appdata) return path.join(appdata, 'Claude', 'claude_desktop_config.json');
      if (isMac) return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
    }
    case 'claude-code':
      return path.join(home, '.claude', 'settings.json');
    case 'cursor':
      return path.join(useProject ? cwd : home, '.cursor', 'mcp.json');
    case 'vscode':
      // Project-level: .vscode/mcp.json (uses 'servers' key, VS Code 1.99+)
      // Global: VS Code settings.json — not written to avoid stomping unrelated settings
      return useProject ? path.join(cwd, '.vscode', 'mcp.json') : null;
    case 'windsurf':
      return path.join(home, '.codeium', 'windsurf', 'mcp_config.json');
    case 'continue':
      return path.join(useProject ? cwd : home, '.continue', 'mcpServers', 'mcp.json');
    case 'cline':
      return path.join(home, '.cline', 'mcp.json');
    case 'codex':
      return path.join(home, '.codex', 'config.json');
    case 'grokbuild':
      return path.join(home, '.grokbuild', 'mcp.json');
    default:
      return null;
  }
}

export function detectPreferredClient(): ClientId {
  // Check in priority order: most recently adopted first
  const candidates: ClientId[] = ['claude-code', 'cursor', 'claude', 'windsurf', 'cline', 'continue', 'grokbuild'];
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

export function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === 'win32') {
      execSync('clip', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
    if (process.platform === 'darwin') {
      execSync('pbcopy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
    try {
      execSync('xclip -selection clipboard', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    } catch {}
    execSync('wl-copy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

export function getClientSteps(client: ClientId, transport: 'stdio' | 'http' = 'http'): string[] {
  switch (client) {
    case 'claude':
      return [
        'Open Claude Desktop.',
        'Go to Settings → Developer → Edit Config (or edit claude_desktop_config.json directly).',
        'The entry has been auto-merged under "mcpServers".',
        'Save and fully restart Claude Desktop.',
      ];
    case 'claude-code':
      return transport === 'stdio'
        ? [
            'The entry has been merged into ~/.claude/settings.json.',
            'Claude Code reads this on startup — no restart needed for new sessions.',
            'Verify: claude mcp list  (or start a new chat and try the server tools).',
          ]
        : [
            'The HTTP entry has been merged into ~/.claude/settings.json.',
            'Ensure the server is running: hoolix start <slug>',
            'Verify: claude mcp list',
          ];
    case 'cursor':
      return [
        'The entry has been auto-merged into ~/.cursor/mcp.json (or .cursor/mcp.json for --project).',
        'Reload the Cursor window: Cmd/Ctrl+Shift+P → "Reload Window".',
      ];
    case 'vscode':
      return [
        'The entry has been written to .vscode/mcp.json in your project.',
        'VS Code 1.99+ picks this up automatically — reload the window to apply.',
        'Tip: commit .vscode/mcp.json to share the MCP setup with your team.',
      ];
    case 'windsurf':
      return [
        'The entry has been merged into ~/.codeium/windsurf/mcp_config.json.',
        'Restart Windsurf or reload the Cascade panel.',
      ];
    case 'continue':
      return [
        'The entry has been written to .continue/mcpServers/mcp.json.',
        'Restart the Continue extension or reload your IDE.',
      ];
    case 'cline':
      return [
        'The entry has been merged into ~/.cline/mcp.json.',
        'Reload the Cline extension in your editor.',
      ];
    case 'codex':
      return [
        'The entry has been merged into ~/.codex/config.json.',
        'Restart or reconnect the Codex CLI session.',
      ];
    case 'grokbuild':
      return [
        'Add the JSON snippet to your Grok Build / xAI agent MCP configuration.',
        'Restart or reconnect the agent session.',
      ];
    default:
      return [
        'Copy the JSON block above.',
        'Add it under the "mcpServers" key in your client\'s MCP configuration file.',
        'Restart/reload the client application.',
      ];
  }
}

// ── Config entry builders ─────────────────────────────────────────────────────

interface StdioMcpEntry {
  type?: 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface HttpMcpEntry {
  type: 'streamable-http';
  url: string;
  headers: Record<string, string>;
}

type McpEntry = StdioMcpEntry | HttpMcpEntry;

function buildStdioEntry(client: ClientId, runConfig: { command: string; args: string[]; env: Record<string, string> }): StdioMcpEntry {
  const entry: StdioMcpEntry = {
    command: runConfig.command,
    args: runConfig.args,
  };
  // Include type field for clients that expect it
  if (client === 'claude-code' || client === 'vscode') {
    entry.type = 'stdio';
  }
  // Only include env if non-empty
  const nonEmptyEnv = Object.fromEntries(Object.entries(runConfig.env).filter(([, v]) => v));
  if (Object.keys(nonEmptyEnv).length > 0) entry.env = nonEmptyEnv;
  return entry;
}

function buildHttpEntry(authKey: string, port: number): HttpMcpEntry {
  return {
    type: 'streamable-http',
    url: `http://127.0.0.1:${port}/mcp`,
    headers: { Authorization: `Bearer ${authKey}` },
  };
}

/**
 * Build the full payload object to merge into the client config file.
 * VS Code project-level uses 'servers' key + type field; all others use 'mcpServers'.
 */
function buildPayload(
  client: ClientId,
  slug: string,
  entry: McpEntry,
  isProject: boolean,
): { key: string; payload: Record<string, unknown> } {
  if (client === 'vscode' && isProject) {
    return {
      key: 'servers',
      payload: { servers: { [slug]: entry } },
    };
  }
  return {
    key: 'mcpServers',
    payload: { mcpServers: { [slug]: entry } },
  };
}

async function validateClientConfigWrite(
  cfgPath: string,
  slug: string,
  payloadKey: string,
  expected: unknown,
): Promise<{ ok: boolean; issue?: string }> {
  try {
    const written = await fs.readJson(cfgPath);
    const actual = written?.[payloadKey]?.[slug];
    if (!actual || typeof actual !== 'object') return { ok: false, issue: 'server entry missing after write' };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) return { ok: false, issue: 'server entry differs after write' };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, issue: e?.message || String(e) };
  }
}

// ── Unresolved placeholder detection ─────────────────────────────────────────

function hasUnresolvedPlaceholders(obj: unknown): boolean {
  const str = JSON.stringify(obj);
  return /\{[a-zA-Z]\w*\}/.test(str);
}

// ── Main command ──────────────────────────────────────────────────────────────

export async function cmdConnect(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
  if (!slug) {
    logger.error('Usage: hoolix connect <slug> [--client claude|claude-code|cursor|vscode|…] [--yes] [--dry-run] [--json] [--project] [--port N]');
    process.exit(1);
  }

  let meta: any;
  try {
    meta = await getServerMetadata(slug);
  } catch (e: any) {
    if (e instanceof ServerNotFoundError || e?.code === 'SERVER_NOT_FOUND') {
      logger.error(`Server "${slug}" not found. Run "hoolix list" to see available servers.`);
    } else {
      logger.error('Failed to load server metadata:', e?.message || e);
    }
    process.exit(1);
  }

  const force     = args.includes('--yes') || args.includes('-y');
  const isProject = args.includes('--project');
  const isDryRun  = args.includes('--dry-run');
  const serverKind: 'docs-rag' | 'mcp-server' = meta.serverKind ?? 'docs-rag';

  // ── Client selection ────────────────────────────────────────────────────────
  const clientIdx = args.indexOf('--client');
  let client: ClientId | undefined = (clientIdx !== -1 ? args[clientIdx + 1] : undefined) as ClientId | undefined;
  if (!client) {
    if (force || json) {
      client = 'generic';
    } else {
      const detected = detectPreferredClient();
      const options: ClientOption[] = [
        { value: 'claude',      label: 'Claude Desktop',                 hint: 'Global settings' },
        { value: 'claude-code', label: 'Claude Code CLI (~/.claude/)',    hint: 'Recommended for Claude Code users' },
        { value: 'cursor',      label: 'Cursor',                          hint: 'Global or --project' },
        { value: 'vscode',      label: 'VS Code (project .vscode/)',      hint: 'Use --project' },
        { value: 'windsurf',    label: 'Windsurf / Codeium' },
        { value: 'continue',    label: 'Continue.dev' },
        { value: 'cline',       label: 'Cline' },
        { value: 'codex',       label: 'OpenAI Codex CLI' },
        { value: 'grokbuild',   label: 'Grok Build / xAI' },
        { value: 'generic',     label: 'Generic (print JSON only)' },
      ];
      const sel = await select({
        message: 'Select target MCP client (config will be auto-merged with backup)',
        options,
        initialValue: detected,
      });
      if (isCancel(sel)) { cancel('Connect cancelled'); process.exit(0); }
      client = sel as ClientId;
    }
  }
  if (!ALL_CLIENTS.includes(client as ClientId)) client = 'generic';

  // ── Build MCP entry based on server kind ────────────────────────────────────
  let mcpEntry: McpEntry;
  let transport: 'stdio' | 'http';

  if (serverKind === 'mcp-server') {
    // If the server is running in proxy mode, use HTTP config (same as docs-rag)
    const proxyStatus = await serverManager.getStatus(slug);
    if (proxyStatus.running && proxyStatus.mode === 'proxy' && proxyStatus.port) {
      transport = 'http';
      mcpEntry  = buildHttpEntry(meta.authKey, proxyStatus.port);
    } else {
      // Config-only: load credentials + interpolate into the template's run config
      const templateId = meta.definition?.template?.id;
      if (!templateId) {
        logger.error(`Server "${slug}" has no template ID in its definition. Next: delete and recreate with a supported template.`);
        process.exit(1);
      }

      let template: Awaited<ReturnType<typeof getTemplate>> | null = null;
      try {
        template = await getTemplate(templateId);
      } catch {
        logger.error(`Template "${templateId}" not found. Next: run "hoolix templates list".`);
        process.exit(1);
      }

      if (!template!.server) {
        logger.error(`Template "${templateId}" has no server run config. Next: check template definition.`);
        process.exit(1);
      }

      const credentials = await loadCredentials(slug);
      const templateInputs = meta.definition?.template?.inputs ?? {};
      const substitutions: Record<string, string> = { ...templateInputs, ...credentials };
      const interpolated = interpolateRunConfig(template!.server, substitutions);

      if (hasUnresolvedPlaceholders(interpolated)) {
        logger.warn(`Some placeholders in the run config could not be resolved. Credentials may be missing — check: hoolix info ${slug}`);
      }

      transport = template!.server.transport ?? 'stdio';
      mcpEntry = buildStdioEntry(client as ClientId, interpolated);
    }

  } else {
    // docs-rag: existing HTTP streamable flow
    transport = 'http';
    const status     = await serverManager.getStatus(slug);
    const portIdx    = args.indexOf('--port');
    const portFromArg = portIdx !== -1 ? parseInt(args[portIdx + 1] || '0', 10) || undefined : undefined;
    let   port       = status.port || portFromArg;

    if (!port) {
      if (json) {
        logger.error(`Server "${slug}" is not running and no --port provided.`);
        logger.info(`Next: start it first (hoolix start ${slug}) then retry, or pass --port N.`);
        process.exit(1);
      }
      const suggested = 3456 + Math.floor(Math.random() * 400);
      if (force) {
        port = suggested;
        logger.warn(`Server not detected running. Using suggested port ${port} (ensure you start with matching port).`);
      } else {
        const portInput = await text({
          message: 'Port the MCP server listens on (must match the started server)',
          placeholder: String(suggested),
          validate: (v) => {
            const n = parseInt(String(v), 10);
            return n >= 1024 && n <= 65535 ? undefined : 'Port must be 1024–65535';
          },
        });
        if (isCancel(portInput)) { cancel('Connect cancelled'); process.exit(0); }
        port = parseInt(String(portInput), 10) || suggested;
      }
    } else if (portFromArg && status.port && portFromArg !== status.port) {
      logger.warn(`--port ${portFromArg} ignored (server already running on :${status.port}).`);
    }

    mcpEntry = buildHttpEntry(meta.authKey, port!);
  }

  // ── Build payload ───────────────────────────────────────────────────────────
  const { key: payloadKey, payload } = buildPayload(client as ClientId, slug, mcpEntry, isProject);
  const entryStr = JSON.stringify(payload, null, 2);

  if (json) {
    printJson({ ...payload, transport, serverKind, client });
    return;
  }

  // ── Write config file (unless --dry-run) ────────────────────────────────────
  const cfgPath = getConfigPath(client as ClientId, { projectCwd: isProject ? process.cwd() : undefined });

  if (cfgPath && !isDryRun) {
    let existing: any = {};
    if (await fs.pathExists(cfgPath)) {
      try {
        existing = await fs.readJson(cfgPath);
      } catch {
        logger.warn('Existing config was invalid JSON; backing up and starting fresh for MCP servers.');
        existing = {};
      }
      const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const rand = Math.random().toString(36).slice(2, 7);
      await fs.copy(cfgPath, `${cfgPath}.${ts}-${rand}.bak`).catch(() => {});
      logger.info(`Backup written: ${cfgPath}.${ts}-${rand}.bak`);
    }
    if (!existing || typeof existing !== 'object') existing = {};

    // Merge only the MCP server entry, leaving all other settings untouched
    if (!existing[payloadKey] || typeof existing[payloadKey] !== 'object') existing[payloadKey] = {};
    const existingSection = existing[payloadKey] as Record<string, unknown>;
    const newSection = payload[payloadKey] as Record<string, unknown>;
    existing[payloadKey] = { ...existingSection, ...newSection };

    await fs.ensureDir(path.dirname(cfgPath));
    await fs.writeJson(cfgPath, existing, { spaces: 2 });

    const validation = await validateClientConfigWrite(cfgPath, slug, payloadKey, mcpEntry);
    logger.success(`Merged "${slug}" into ${client} config.`);
    console.log(`  ${ui.muted('File:')} ${cfgPath}`);
    if (validation.ok) {
      console.log(`  ${ui.success('✓')} Config validation passed.`);
    } else {
      logger.warn(`Config validation failed after write: ${validation.issue}`);
    }
  } else if (!cfgPath && !isDryRun) {
    if (client === 'vscode' && !isProject) {
      // VS Code uses project-level config only — there is no safe global settings.json path.
      console.log('');
      console.log(`  ${ui.warning('○')} VS Code uses project-level MCP config (no global path is written).`);
      console.log(`  ${ui.muted('Run this command from inside your project directory:')}`);
      console.log('');
      console.log(`    ${ui.accent(`hoolix connect ${slug} --client vscode --project`)}`);
      console.log('');
      console.log(`  ${ui.muted('This writes .vscode/mcp.json — commit it to share the setup with your team.')}`);
      console.log(`  ${ui.muted('VS Code 1.99+ picks it up automatically after a window reload.')}`);
    } else {
      logger.info(`No auto-write path for "${client}". Follow the manual steps below.`);
    }
  } else if (isDryRun) {
    console.log(`  ${ui.warning('○')} Dry run — no files written.`);
    if (cfgPath) console.log(`  ${ui.muted('Would write to:')} ${cfgPath}`);
  }

  // ── Output ──────────────────────────────────────────────────────────────────
  printTitle('Connect ready', `"${meta.name}" (${slug}) → ${client}`);

  printSection(`MCP config snippet${isDryRun ? ' (dry run)' : ' (ready to paste)'}`);
  console.log(entryStr);
  console.log('');

  printSection(`Next steps for ${client}`);
  getClientSteps(client as ClientId, transport).forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  if (cfgPath && !isDryRun) {
    console.log(`  ${ui.muted('Auto-merged with backup. Restart/reload the client to apply.')}`);
  }
  console.log('');

  // Transport-specific tip
  if (transport === 'stdio') {
    printSection('How it works (stdio)');
    console.log(`  Your client reads the config and ${chalk_muted('spawns the process on demand')} — no Hoolix host needed.`);
    if ((mcpEntry as StdioMcpEntry).command === 'npx') {
      const pkg = (mcpEntry as StdioMcpEntry).args[1]?.replace(/@latest$/, '');
      console.log(`  On first use the client will run: ${ui.accent((mcpEntry as StdioMcpEntry).args.slice(0, 2).join(' '))} ...`);
      if (pkg) console.log(`  Package: ${ui.accent(pkg)}`);
    }
  } else {
    printSection('Recommended test prompt');
    console.log(`  Use the search_documentation tool, e.g. "search_documentation for installation instructions from ${meta.name}."`);
    console.log(`  Then try read_documentation_page or get_table_of_contents.`);
  }
  console.log('');

  const copied = copyToClipboard(entryStr);
  if (copied) {
    console.log(`  ${ui.success('✓')} Snippet copied to clipboard.`);
  } else {
    console.log(`  ${ui.muted('(Clipboard not available — copy the JSON block manually.)')}`);
  }
  console.log('');

  printSection('Other options');
  if (serverKind === 'mcp-server') {
    printCommand(`hoolix connect ${slug} --client claude-code --yes`);
    printCommand(`hoolix connect ${slug} --client cursor --yes`);
    printCommand(`hoolix connect ${slug} --client vscode --project`);
    printCommand(`hoolix connect ${slug} --dry-run`);
    printCommand(`hoolix connect ${slug} --json`);
  } else {
    printCommand(`hoolix connect ${slug} --client claude --yes`);
    printCommand(`hoolix connect ${slug} --client cursor --project`);
    printCommand(`hoolix connect ${slug} --dry-run`);
    printCommand(`hoolix connect ${slug} --json`);
  }

  if (!isDryRun) {
    console.log(`  ${ui.muted('Tip:')} hoolix client status   (see which clients have this server wired in)`);
    console.log('');
  }
}

// chalk.dim re-export for inline use without import
function chalk_muted(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}
