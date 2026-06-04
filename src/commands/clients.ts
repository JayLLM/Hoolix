/**
 * hoolix clients list  — show all supported clients with detection status
 * hoolix client status — scan detected client configs and show wired servers
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { listRegisteredServers } from '../app/services/servers.js';
import { getConfigPath, ALL_CLIENTS, type ClientId } from './connect.js';
import { logger } from '../core/logger.js';
import {
  printTitle, printSection, printCommand,
  printJson, truncate, ui,
} from '../ui/format.js';

// ── Client metadata ───────────────────────────────────────────────────────────

const CLIENT_LABELS: Record<ClientId, string> = {
  'claude':      'Claude Desktop',
  'claude-code': 'Claude Code CLI',
  'cursor':      'Cursor',
  'vscode':      'VS Code (project)',
  'windsurf':    'Windsurf',
  'continue':    'Continue.dev',
  'cline':       'Cline',
  'codex':       'OpenAI Codex CLI',
  'grokbuild':   'Grok Build / xAI',
  'generic':     'Generic (JSON only)',
};

// ── Detection ─────────────────────────────────────────────────────────────────

type DetectionStatus = 'installed' | 'directory' | 'not-detected' | 'n/a';

interface ClientInfo {
  id: ClientId;
  label: string;
  configPath: string | null;
  status: DetectionStatus;
}

async function detectClient(id: ClientId): Promise<ClientInfo> {
  const label = CLIENT_LABELS[id] ?? id;
  const configPath = getConfigPath(id);

  // generic and vscode (without --project) have no fixed global path
  if (!configPath) {
    return { id, label, configPath: null, status: 'n/a' };
  }

  if (await fs.pathExists(configPath)) {
    return { id, label, configPath, status: 'installed' };
  }

  if (await fs.pathExists(path.dirname(configPath))) {
    return { id, label, configPath, status: 'directory' };
  }

  return { id, label, configPath, status: 'not-detected' };
}

// ── Wired server detection ────────────────────────────────────────────────────

interface WiredServer {
  slug: string;
  transport: 'http' | 'stdio' | 'unknown';
  url?: string;
  command?: string;
  registered: boolean; // present in Hoolix registry
}

function detectTransport(entry: unknown): 'http' | 'stdio' | 'unknown' {
  if (!entry || typeof entry !== 'object') return 'unknown';
  const e = entry as Record<string, unknown>;
  if (e.type === 'streamable-http' || typeof e.url === 'string') return 'http';
  if (e.type === 'stdio' || typeof e.command === 'string') return 'stdio';
  return 'unknown';
}

function extractEntryPreview(entry: unknown): string {
  if (!entry || typeof entry !== 'object') return '';
  const e = entry as Record<string, unknown>;
  if (typeof e.url === 'string') return truncate(e.url, 48);
  if (typeof e.command === 'string') {
    const args = Array.isArray(e.args) ? e.args.slice(0, 3).join(' ') : '';
    return truncate(`${e.command} ${args}`, 48);
  }
  return '';
}

async function getWiredServers(
  configPath: string,
  registeredSlugs: Set<string>,
): Promise<WiredServer[]> {
  try {
    const config = await fs.readJson(configPath);
    // Support both mcpServers (most clients) and servers (VS Code project format)
    const serverMap = (config?.mcpServers ?? config?.servers ?? {}) as Record<string, unknown>;
    return Object.entries(serverMap).map(([slug, entry]) => ({
      slug,
      transport: detectTransport(entry),
      url: typeof (entry as any)?.url === 'string' ? (entry as any).url : undefined,
      command: typeof (entry as any)?.command === 'string' ? (entry as any).command : undefined,
      registered: registeredSlugs.has(slug),
    }));
  } catch {
    return [];
  }
}

// ── Subcommands ───────────────────────────────────────────────────────────────

async function cmdClientsList(json: boolean): Promise<void> {
  const clients = await Promise.all(
    ALL_CLIENTS.filter((id) => id !== 'generic').map(detectClient),
  );

  if (json) {
    printJson(clients.map((c) => ({
      id: c.id,
      label: c.label,
      configPath: c.configPath ?? null,
      status: c.status,
    })));
    return;
  }

  const home = os.homedir();
  const shortenPath = (p: string | null) =>
    p ? p.replace(home, '~') : '—';

  const statusIcon = (s: DetectionStatus) => {
    switch (s) {
      case 'installed':    return ui.success('✓ installed');
      case 'directory':    return ui.accent('○ dir exists');
      case 'not-detected': return ui.muted('✗ not found');
      default:             return ui.muted('— n/a');
    }
  };

  printTitle('MCP Clients', `${clients.length} supported clients`);

  const rows = clients.map((c) => ({
    Client:  CLIENT_LABELS[c.id] ?? c.id,
    ID:      c.id,
    Status:  c.status === 'installed'    ? '✓ installed'
           : c.status === 'directory'    ? '○ dir exists'
           : c.status === 'not-detected' ? '✗ not found'
           : '— n/a',
    'Config path': shortenPath(c.configPath),
  }));

  // Print table with colour manually (printTable doesn't support per-cell colour)
  const labelW = Math.max(...rows.map((r) => r.Client.length), 'Client'.length);
  const idW    = Math.max(...rows.map((r) => r.ID.length), 'ID'.length);
  const statusW = 12;
  const header = `  ${'Client'.padEnd(labelW)}  ${'ID'.padEnd(idW)}  ${'Status'.padEnd(statusW)}  Config path`;
  console.log(ui.muted(header));
  console.log(ui.muted(`  ${'─'.repeat(labelW)}  ${'─'.repeat(idW)}  ${'─'.repeat(statusW)}  ${'─'.repeat(40)}`));
  for (const c of clients) {
    const label  = (CLIENT_LABELS[c.id] ?? c.id).padEnd(labelW);
    const idStr  = c.id.padEnd(idW);
    const status = statusIcon(c.status).padEnd(statusW + 8); // +8 for ANSI codes
    const cfgStr = ui.muted(shortenPath(c.configPath));
    console.log(`  ${label}  ${ui.muted(idStr)}  ${status}  ${cfgStr}`);
  }
  console.log('');

  const installed = clients.filter((c) => c.status === 'installed').length;
  const dirOnly   = clients.filter((c) => c.status === 'directory').length;
  console.log(`  ${ui.success(String(installed))} installed  ${ui.accent(String(dirOnly))} directory-only`);
  console.log('');
  printSection('Next');
  printCommand('hoolix connect <slug>                   (wire a server into a detected client)');
  printCommand('hoolix client status                    (see which servers are already wired)');
  printCommand('hoolix connect <slug> --client vscode --project  (VS Code project-level config)');
}

async function cmdClientStatus(json: boolean): Promise<void> {
  const servers = await listRegisteredServers();
  const registeredSlugs = new Set(servers.map((s) => s.slug));

  const detected = (
    await Promise.all(
      ALL_CLIENTS.filter((id) => id !== 'generic' && id !== 'vscode').map(detectClient),
    )
  ).filter((c) => c.status === 'installed' && c.configPath);

  if (detected.length === 0) {
    if (json) {
      printJson({ clients: [], summary: { totalClients: 0, totalDetected: 0, totalWired: 0 } });
    } else {
      printTitle('Client Status', 'No client config files detected.');
      printSection('Get started');
      printCommand('hoolix connect <slug> --client claude');
      printCommand('hoolix clients list');
    }
    return;
  }

  interface ClientStatus {
    id: ClientId;
    label: string;
    configPath: string;
    wiredServers: WiredServer[];
  }

  const results: ClientStatus[] = await Promise.all(
    detected.map(async (c) => ({
      id: c.id,
      label: c.label,
      configPath: c.configPath!,
      wiredServers: await getWiredServers(c.configPath!, registeredSlugs),
    })),
  );

  const totalWired = results.reduce(
    (sum, r) => sum + r.wiredServers.filter((s) => s.registered).length,
    0,
  );

  if (json) {
    printJson({
      clients: results.map((r) => ({
        id: r.id,
        label: r.label,
        configPath: r.configPath,
        wiredServers: r.wiredServers,
      })),
      summary: {
        totalClientsDetected: detected.length,
        totalHoolixServers:   servers.length,
        totalWired,
      },
    });
    return;
  }

  const home = os.homedir();
  printTitle('Client Status', `${detected.length} client${detected.length === 1 ? '' : 's'} detected`);

  for (const r of results) {
    const hoolix = r.wiredServers.filter((s) => s.registered);
    const other  = r.wiredServers.filter((s) => !s.registered);
    const cfgShort = r.configPath.replace(home, '~');

    if (r.wiredServers.length === 0) {
      console.log(`  ${ui.accent(CLIENT_LABELS[r.id] ?? r.id)}  ${ui.muted('no mcpServers configured')}`);
      console.log(`  ${ui.muted(cfgShort)}`);
    } else {
      const hoolixNote = hoolix.length > 0 ? ui.success(`${hoolix.length} hoolix`) : '';
      const otherNote  = other.length > 0  ? ui.muted(`${other.length} other`)    : '';
      const notes      = [hoolixNote, otherNote].filter(Boolean).join('  ');
      console.log(`  ${ui.accent(CLIENT_LABELS[r.id] ?? r.id)}  ${notes}`);
      console.log(`  ${ui.muted(cfgShort)}`);

      for (const s of hoolix) {
        const transport = s.transport === 'http' ? ui.accent('http ') : ui.success('stdio');
        const preview   = extractEntryPreview(s);
        console.log(`    ${ui.success('✓')} ${s.slug.padEnd(24)} ${transport}  ${ui.muted(preview)}`);
      }
      for (const s of other) {
        const transport = s.transport === 'http' ? ui.accent('http ') : ui.muted('stdio');
        const preview   = extractEntryPreview(s);
        console.log(`    ${ui.muted('○')} ${s.slug.padEnd(24)} ${transport}  ${ui.muted(preview)}`);
      }
    }
    console.log('');
  }

  // Servers not wired anywhere
  const wiredSlugs = new Set(
    results.flatMap((r) => r.wiredServers.filter((s) => s.registered).map((s) => s.slug)),
  );
  const notWired = servers.filter((s) => !wiredSlugs.has(s.slug));
  if (notWired.length > 0) {
    printSection('Hoolix servers not yet wired into any client');
    for (const s of notWired) {
      const kind = (s as any).serverKind === 'mcp-server' ? 'mcp-server' : 'docs-rag';
      console.log(`  ${ui.warning('○')} ${s.slug.padEnd(26)} ${ui.muted(kind)}`);
    }
    console.log('');
    printCommand(`hoolix connect ${notWired[0].slug}`);
    console.log('');
  }

  console.log(`  ${ui.success(String(totalWired))} Hoolix server${totalWired === 1 ? '' : 's'} wired across ${detected.length} client${detected.length === 1 ? '' : 's'}`);
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function cmdClients(args: string[], json: boolean): Promise<void> {
  // 'client status' (singular) routes here too via the dispatcher alias
  // args[0] = 'clients' | 'client', args[1] = sub-command
  const sub = args[1] || 'list';

  switch (sub) {
    case 'list':
    case 'ls':
      await cmdClientsList(json);
      return;
    case 'status':
    case 'st':
      await cmdClientStatus(json);
      return;
    default:
      if (json) {
        printJson({ ok: false, error: `Unknown clients sub-command "${sub}". Next: use list or status.` });
      } else {
        logger.error(`Unknown sub-command "${sub}". Next: hoolix clients list  or  hoolix client status`);
      }
      process.exit(1);
  }
}
