import { validateServerState } from '../core/registry.js';
import { getServerSourceLabel, listRegisteredServers } from '../app/services/servers.js';
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
    printCommand('hoolix templates list');
    console.log('');
    return;
  }

  printTitle('Servers', `${servers.length} registered MCP server${servers.length === 1 ? '' : 's'}`);

  const rows = servers.map((s) => {
    const isMcpServer = (s as any).serverKind === 'mcp-server';
    const chunksOrTransport = isMcpServer
      ? 'stdio'
      : s.chunkCount.toLocaleString();
    const sourceOrTemplate = isMcpServer
      ? (s.definition?.template?.id ?? 'mcp-server')
      : truncate((s.definition?.sources.length ?? 1) > 1 ? getServerSourceLabel(s) : s.sourceUrl, 44);
    return {
      Name:      truncate(s.name, 26),
      Slug:      s.slug,
      Kind:      isMcpServer ? 'mcp-server' : 'docs-rag',
      Chunks:    chunksOrTransport,
      Freshness: isMcpServer ? '—' : getFreshness(s.lastUpdatedAt).message,
      Source:    sourceOrTemplate,
      Created:   formatDate(s.createdAt),
    };
  });

  printTable(rows);
  console.log('');

  for (const s of servers) {
    // Only validate docs-rag servers (mcp-server has no chunks to validate)
    if ((s as any).serverKind === 'mcp-server') continue;
    try {
      const v = await validateServerState(s.slug);
      if (!v.valid) logger.warn(`${s.slug}: ${v.issues.join('; ')}`);
    } catch {
      // ignore per-server validation errors in list output
    }
  }
}
