import { validateServerState } from '../core/registry.js';
import { listRegisteredServers } from '../app/services/servers.js';
import { logger } from '../core/logger.js';
import { printTitle, printSection, printCommand, printTable, printJson, truncate, getFreshness, formatDate } from '../ui/format.js';

export async function cmdList(json: boolean): Promise<void> {
  const servers = await listRegisteredServers();

  if (json) {
    printJson(servers);
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
    Name:      truncate(s.name, 28),
    Slug:      s.slug,
    Chunks:    s.chunkCount.toLocaleString(),
    Freshness: getFreshness(s.lastUpdatedAt).message,
    Source:    truncate(s.sourceUrl, 48),
    Created:   formatDate(s.createdAt),
  }));

  printTable(rows);
  console.log('');

  for (const s of servers) {
    try {
      const v = await validateServerState(s.slug);
      if (!v.valid) logger.warn(`${s.slug}: ${v.issues.join('; ')}`);
    } catch {
      // ignore per-server validation errors in list output
    }
  }
}
