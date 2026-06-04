import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { execSync } from 'node:child_process';
import { text, select, isCancel, cancel } from '@clack/prompts';
import { getServerMetadata } from '../core/registry.js';
import { serverManager } from '../process/manager.js';
import { logger } from '../core/logger.js';
import { ServerNotFoundError } from '../core/errors.js';
import {
  printTitle, printSection, printCommand, printJson, ui,
} from '../ui/format.js';

// ── Client helpers ───────────────────────────────────────────────────────────

export type ClientId = 'claude' | 'cursor' | 'windsurf' | 'continue' | 'cline' | 'grokbuild' | 'generic';

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
    case 'cursor':    return path.join(useProject ? cwd : home, '.cursor', 'mcp.json');
    case 'windsurf':  return path.join(home, '.codeium', 'windsurf', 'mcp_config.json');
    case 'continue':  return path.join(useProject ? cwd : home, '.continue', 'mcpServers', 'mcp.json');
    case 'cline':     return path.join(home, '.cline', 'mcp.json');
    case 'grokbuild': return path.join(home, '.grokbuild', 'mcp.json');
    default:          return null;
  }
}

export function detectPreferredClient(): ClientId {
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

export function getClientSteps(client: ClientId): string[] {
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
        'Edit ~/.continue/config.json or the mcpServers file (we wrote to .continue/mcpServers/mcp.json).',
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
    default:
      return [
        'Copy the JSON block above.',
        'Add it under the "mcpServers" key in your client\'s MCP configuration file.',
        'Restart/reload the client application.',
      ];
  }
}

async function validateClientConfigWrite(cfgPath: string, slug: string, expected: unknown): Promise<{ ok: boolean; issue?: string }> {
  try {
    const written = await fs.readJson(cfgPath);
    const actual  = written?.mcpServers?.[slug];
    if (!actual || typeof actual !== 'object') return { ok: false, issue: 'server entry missing after write' };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) return { ok: false, issue: 'server entry differs after write' };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, issue: e?.message || String(e) };
  }
}

// ── Main command ─────────────────────────────────────────────────────────────

export async function cmdConnect(args: string[], json: boolean): Promise<void> {
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

  const status     = await serverManager.getStatus(slug);
  const portIdx    = args.indexOf('--port');
  const portFromArg = portIdx !== -1 ? parseInt(args[portIdx + 1] || '0', 10) || undefined : undefined;
  let   port       = status.port || portFromArg;
  const force      = args.includes('--yes') || args.includes('-y');
  const isProject  = args.includes('--project');

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
        message:  'Port the MCP server listens on (must match the started server)',
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

  const authKey   = meta.authKey;
  const serverUrl = `http://127.0.0.1:${port}/mcp`;
  const mcpEntry  = { type: 'streamable-http', url: serverUrl, headers: { Authorization: `Bearer ${authKey}` } };
  const payload   = { mcpServers: { [slug]: mcpEntry } };

  if (json) {
    printJson(payload);
    return;
  }

  // Client selection
  const clientIdx = args.indexOf('--client');
  let   client: ClientId | undefined = (clientIdx !== -1 ? args[clientIdx + 1] : undefined) as ClientId | undefined;
  if (!client) {
    if (force) {
      client = 'generic';
    } else {
      const detected = detectPreferredClient();
      const options: ClientOption[] = [
        { value: 'cursor',    label: 'Cursor (global ~/.cursor/mcp.json or --project)', hint: 'Recommended for most devs' },
        { value: 'claude',    label: 'Claude Desktop', hint: 'Global only' },
        { value: 'windsurf',  label: 'Windsurf / Codeium' },
        { value: 'continue',  label: 'Continue.dev' },
        { value: 'cline',     label: 'Cline' },
        { value: 'grokbuild', label: 'Grok Build / xAI' },
        { value: 'generic',   label: 'Generic (print JSON only)' },
      ];
      const sel = await select({ message: 'Select target MCP client (config will be auto-merged with backup)', options, initialValue: detected });
      if (isCancel(sel)) { cancel('Connect cancelled'); process.exit(0); }
      client = sel as ClientId;
    }
  }

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
      const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const rand = Math.random().toString(36).slice(2, 7);
      await fs.copy(cfgPath, `${cfgPath}.${ts}-${rand}.bak`).catch(() => {});
      logger.info(`Backup written: ${cfgPath}.${ts}-${rand}.bak`);
    }
    if (!existing || typeof existing !== 'object') existing = {};
    if (!existing.mcpServers || typeof existing.mcpServers !== 'object') existing.mcpServers = {};
    existing.mcpServers = { ...existing.mcpServers, ...payload.mcpServers };

    await fs.ensureDir(path.dirname(cfgPath));
    await fs.writeJson(cfgPath, existing, { spaces: 2 });
    const validation = await validateClientConfigWrite(cfgPath, slug, mcpEntry);
    logger.success(`Merged server "${slug}" into ${client} config.`);
    console.log(`  ${ui.muted('File:')} ${cfgPath}`);
    if (validation.ok) {
      console.log(`  ${ui.success('✓')} Config validation passed.`);
    } else {
      logger.warn(`Config validation failed after write: ${validation.issue}`);
    }
  } else {
    logger.info(`No auto-write path for client "${client}" (or generic chosen). Follow manual steps below.`);
  }

  printTitle('Connect ready', `Prepared "${meta.name}" (${slug}) for ${client}`);
  printSection('MCP config snippet (ready to paste)');
  console.log(entryStr);
  console.log('');

  printSection('Next steps for this client');
  getClientSteps(client as ClientId).forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
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
