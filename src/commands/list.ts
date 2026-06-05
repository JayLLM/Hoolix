import { validateServerState } from '../core/registry.js';
import { getServerSourceLabel, listRegisteredServers } from '../app/services/servers.js';
import { serverManager } from '../process/manager.js';
import { listGateways } from '../core/gateways.js';
import { logger } from '../core/logger.js';
import { printTitle, printSection, printCommand, printTable, printJson, truncate, getFreshness, formatDate, ui } from '../ui/format.js';

export async function cmdList(json: boolean): Promise<void> {
  const servers = await listRegisteredServers();
  const gateways = await listGateways();

  if (json) {
    printJson({ servers, gateways: await Promise.all(gateways.map(async (gateway) => ({ ...gateway, status: await serverManager.getGatewayStatus(gateway.slug) }))) });
    return;
  }

  if (servers.length === 0 && gateways.length === 0) {
    printTitle('Servers + Gateways', 'No MCP servers or unified gateways registered yet.');
    printSection('Create your first server');
    printCommand('hoolix install filesystem /Users/jay/projects --yes');
    printCommand('hoolix install github-api --yes');
    printCommand('hoolix gateway create my-tools --include github --include filesystem');
    printCommand('hoolix create "My Docs" --url https://example.com/docs/llms.txt');
    printCommand('hoolix templates list');
    console.log('');
    return;
  }

  printTitle('Servers', `${servers.length} registered MCP server${servers.length === 1 ? '' : 's'}`);

  // Fetch proxy/running status concurrently for mcp-server kind servers
  const mcpServerSlugs = servers
    .filter((s) => (s as any).serverKind === 'mcp-server')
    .map((s) => s.slug);

  const statusMap: Record<string, { running: boolean; mode?: string; port?: number }> = {};
  if (mcpServerSlugs.length > 0) {
    await Promise.all(
      mcpServerSlugs.map(async (slug) => {
        try {
          statusMap[slug] = await serverManager.getStatus(slug);
        } catch {
          statusMap[slug] = { running: false };
        }
      }),
    );
  }

  const rows = servers.map((s) => {
    const isMcpServer = (s as any).serverKind === 'mcp-server';
    const st = statusMap[s.slug];

    let statusOrChunks: string;
    if (isMcpServer) {
      if (st?.running && st.mode === 'proxy' && st.port) {
        statusOrChunks = `proxy:${st.port}`;
      } else if (st?.running) {
        statusOrChunks = `running`;
      } else {
        statusOrChunks = 'stdio';
      }
    } else {
      statusOrChunks = s.chunkCount.toLocaleString();
    }

    const sourceOrTemplate = isMcpServer
      ? (s.definition?.template?.id ?? 'mcp-server')
      : truncate((s.definition?.sources.length ?? 1) > 1 ? getServerSourceLabel(s) : s.sourceUrl, 44);

    return {
      Name:      truncate(s.name, 26),
      Slug:      s.slug,
      Kind:      isMcpServer ? 'mcp-server' : 'docs-rag',
      Status:    statusOrChunks,
      Freshness: isMcpServer ? '—' : getFreshness(s.lastUpdatedAt).message,
      Source:    sourceOrTemplate,
      Created:   formatDate(s.createdAt),
    };
  });

  printTable(rows);
  console.log('');

  if (gateways.length > 0) {
    const gatewayRows = await Promise.all(gateways.map(async (gateway) => {
      const st = await serverManager.getGatewayStatus(gateway.slug);
      return {
        Name: gateway.name,
        Slug: gateway.slug,
        Kind: 'gateway',
        Status: st.running && st.port ? `gateway:${st.port}` : 'stopped',
        Backends: gateway.backends.map((backend) => backend.namespace).join(', '),
        Created: formatDate(gateway.createdAt),
      };
    }));
    printSection('Unified gateways');
    printTable(gatewayRows);
    console.log('');
  }

  const proxyRunning = Object.values(statusMap).filter((s) => s.running && s.mode === 'proxy');
  if (proxyRunning.length > 0) {
    console.log(`  ${ui.success('●')} ${proxyRunning.length} mcp-server(s) running in proxy mode. Use ${ui.accent('hoolix connect <slug>')} for HTTP config.`);
    console.log('');
  }

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
