import fs from 'fs-extra';
import path from 'node:path';
import { createGateway, getGateway, listGateways } from '../core/gateways.js';
import { serverManager } from '../process/manager.js';
import { logger } from '../core/logger.js';
import { ALL_CLIENTS, copyToClipboard, detectPreferredClient, getClientSteps, getConfigPath, type ClientId } from './connect.js';
import { printTitle, printSection, printDetails, printCommand, printJson, printTable, ui } from '../ui/format.js';

function parseIncludes(args: string[]): string[] {
  const includes: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--include' && args[i + 1]) includes.push(args[i + 1]);
  }
  return includes;
}

function getPortArg(args: string[]): number | undefined {
  const idx = args.indexOf('--port');
  return idx !== -1 ? parseInt(args[idx + 1] || '0', 10) || undefined : undefined;
}

function buildHttpEntry(authKey: string, port: number): { type: 'streamable-http'; url: string; headers: Record<string, string> } {
  return {
    type: 'streamable-http',
    url: `http://127.0.0.1:${port}/mcp`,
    headers: { Authorization: `Bearer ${authKey}` },
  };
}

function buildPayload(client: ClientId, slug: string, entry: unknown, isProject: boolean): { key: string; payload: Record<string, unknown> } {
  if (client === 'vscode' && isProject) {
    return { key: 'servers', payload: { servers: { [slug]: entry } } };
  }
  return { key: 'mcpServers', payload: { mcpServers: { [slug]: entry } } };
}

async function writeClientConfig(client: ClientId, key: string, payload: Record<string, unknown>, isProject: boolean): Promise<string | null> {
  const cfgPath = getConfigPath(client, { projectCwd: isProject ? process.cwd() : undefined });
  if (!cfgPath) return null;
  let existing: Record<string, unknown> = {};
  if (await fs.pathExists(cfgPath)) {
    try {
      existing = await fs.readJson(cfgPath);
    } catch {
      existing = {};
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await fs.copy(cfgPath, `${cfgPath}.${ts}.bak`).catch(() => {});
  }
  if (!existing[key] || typeof existing[key] !== 'object') existing[key] = {};
  existing[key] = { ...(existing[key] as Record<string, unknown>), ...((payload[key] as Record<string, unknown>) ?? {}) };
  await fs.ensureDir(path.dirname(cfgPath));
  await fs.writeJson(cfgPath, existing, { spaces: 2 });
  return cfgPath;
}

export async function cmdGateway(args: string[], json: boolean): Promise<void> {
  const sub = args[1] || 'list';

  if (sub === 'create') {
    const name = args[2];
    const includes = parseIncludes(args);
    if (!name || includes.length === 0) {
      if (json) printJson({ ok: false, error: 'Usage: hoolix gateway create <name> --include <server-slug> ...' });
      else logger.error('Usage: hoolix gateway create <name> --include <server-slug> --include <server-slug>');
      process.exit(1);
    }

    try {
      const gateway = await createGateway(name, includes);
      if (json) {
        printJson({ ok: true, gateway, next: [`hoolix gateway start ${gateway.slug}`, `hoolix gateway connect ${gateway.slug} --client codex`] });
        return;
      }
      printTitle('Gateway created', `"${gateway.name}" aggregates ${gateway.backends.length} MCP server(s).`);
      printDetails([
        ['Slug', gateway.slug],
        ['Backends', gateway.backends.map((backend) => `${backend.namespace}=${backend.slug}`).join(', ')],
        ['Auth', 'generated'],
      ]);
      console.log('');
      printSection('Next steps');
      printCommand(`hoolix gateway start ${gateway.slug}`);
      printCommand(`hoolix gateway connect ${gateway.slug} --client codex`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (json) printJson({ ok: false, error: message });
      else logger.error(message);
      process.exit(1);
    }
    return;
  }

  if (sub === 'list') {
    const gateways = await listGateways();
    const rows = await Promise.all(gateways.map(async (gateway) => {
      const status = await serverManager.getGatewayStatus(gateway.slug);
      return {
        Name: gateway.name,
        Slug: gateway.slug,
        Status: status.running && status.port ? `gateway:${status.port}` : 'stopped',
        Backends: gateway.backends.map((backend) => backend.namespace).join(', '),
        Created: gateway.createdAt.slice(0, 10),
      };
    }));
    if (json) {
      printJson(await Promise.all(gateways.map(async (gateway) => ({ ...gateway, status: await serverManager.getGatewayStatus(gateway.slug) }))));
      return;
    }
    if (gateways.length === 0) {
      printTitle('Gateways', 'No unified MCP gateways yet.');
      printCommand('hoolix gateway create my-tools --include github --include filesystem --include brave-search');
      printCommand('hoolix install github-api --name github --yes');
      return;
    }
    printTitle('Gateways', `${gateways.length} unified gateway${gateways.length === 1 ? '' : 's'}`);
    printTable(rows);
    return;
  }

  if (sub === 'start') {
    const slug = args[2];
    if (!slug) {
      if (json) printJson({ ok: false, error: 'Missing gateway name. Next: hoolix gateway start <name>.' });
      else logger.error('Usage: hoolix gateway start <name> [--port N]');
      process.exit(1);
    }
    const gateway = await getGateway(slug);
    const port = getPortArg(args);
    const started = await serverManager.startGateway(gateway.slug, { port, authKey: gateway.authKey });
    if (json) {
      printJson({
        ok: true,
        gateway: gateway.slug,
        mode: 'gateway',
        port: started.port,
        pid: started.pid,
        url: `http://127.0.0.1:${started.port}/mcp`,
        mcpServers: { [gateway.slug]: buildHttpEntry(gateway.authKey, started.port) },
      });
      return;
    }
    printTitle('Gateway running', `"${gateway.name}" is one MCP endpoint for ${gateway.backends.length} server(s).`);
    printDetails([
      ['URL', `http://127.0.0.1:${started.port}/mcp`],
      ['Auth', `Authorization: Bearer ${gateway.authKey}`],
      ['Backends', gateway.backends.map((backend) => `${backend.namespace}.${backend.slug}`).join(', ')],
      ['PID', started.pid],
    ]);
    console.log('');
    printCommand(`hoolix gateway connect ${gateway.slug} --client codex`);
    return;
  }

  if (sub === 'stop') {
    const slug = args[2];
    if (!slug) {
      if (json) printJson({ ok: false, error: 'Missing gateway name. Next: hoolix gateway stop <name>.' });
      else logger.error('Usage: hoolix gateway stop <name>');
      process.exit(1);
    }
    const stopped = await serverManager.stopGateway(slug);
    if (json) printJson({ ok: true, gateway: slug, stopped });
    else if (stopped) logger.success(`Stopped gateway ${slug}`);
    else logger.info(`Gateway ${slug} was not running.`);
    return;
  }

  if (sub === 'connect') {
    const slug = args[2];
    if (!slug) {
      if (json) printJson({ ok: false, error: 'Missing gateway name. Next: hoolix gateway connect <name> --client codex.' });
      else logger.error('Usage: hoolix gateway connect <name> --client <client>');
      process.exit(1);
    }
    const gateway = await getGateway(slug);
    const status = await serverManager.getGatewayStatus(gateway.slug);
    const port = status.port || getPortArg(args);
    if (!port) {
      if (json) printJson({ ok: false, error: `Gateway "${gateway.slug}" is not running. Next: hoolix gateway start ${gateway.slug}.` });
      else logger.error(`Gateway "${gateway.slug}" is not running. Next: hoolix gateway start ${gateway.slug}.`);
      process.exit(1);
    }

    const clientIdx = args.indexOf('--client');
    let client = (clientIdx !== -1 ? args[clientIdx + 1] : undefined) as ClientId | undefined;
    if (!client || !ALL_CLIENTS.includes(client)) client = json ? 'generic' : detectPreferredClient();
    const isProject = args.includes('--project');
    const isDryRun = args.includes('--dry-run');
    const entry = buildHttpEntry(gateway.authKey, port);
    const { key, payload } = buildPayload(client, gateway.slug, entry, isProject);

    if (json) {
      printJson({ ...payload, transport: 'http', gateway: gateway.slug, client });
      return;
    }

    const cfgPath = isDryRun ? null : await writeClientConfig(client, key, payload, isProject);
    printTitle('Gateway connect ready', `"${gateway.name}" → ${client}`);
    printSection('MCP config snippet');
    const entryStr = JSON.stringify(payload, null, 2);
    console.log(entryStr);
    console.log('');
    if (cfgPath) console.log(`  ${ui.success('✓')} Merged into ${cfgPath}`);
    else if (isDryRun) console.log(`  ${ui.warning('○')} Dry run — no files written.`);
    else console.log(`  ${ui.muted('Manual config for this client; no safe auto-write path.')}`);
    console.log('');
    printSection(`Next steps for ${client}`);
    getClientSteps(client, 'http').forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
    console.log('');
    if (copyToClipboard(entryStr)) console.log(`  ${ui.success('✓')} Snippet copied to clipboard.`);
    return;
  }

  if (json) printJson({ ok: false, error: `Unknown gateway command "${sub}". Next: use create, list, start, stop, or connect.` });
  else logger.error(`Unknown gateway command "${sub}". Next: run hoolix gateway list.`);
  process.exit(1);
}
