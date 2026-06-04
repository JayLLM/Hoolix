import { getServerMetadata } from '../core/registry.js';
import { serverManager } from '../process/manager.js';
import { logger } from '../core/logger.js';
import {
  printTitle, printSection, printDetails, printCommand, printJson, ui,
} from '../ui/format.js';

export async function cmdStart(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix start <slug> [--port <n>] [--transport stdio] --json.' });
    else logger.error('Usage: hoolix start <slug> [--port <n>] [--transport stdio] [--json]');
    process.exit(1);
  }

  // ── mcp-server kind: config-only in Phase 1 ──────────────────────────────
  // These servers are spawned by the client — no Hoolix HTTP host needed.
  const metaEarly = await getServerMetadata(slug).catch(() => null);
  if (metaEarly?.serverKind === 'mcp-server') {
    const templateId = metaEarly.definition?.template?.id ?? 'unknown';
    if (json) {
      printJson({
        ok:       false,
        kind:     'mcp-server',
        slug,
        error:    `"${metaEarly.name}" uses stdio transport (${templateId}). Your MCP client spawns the process — no Hoolix host is needed.`,
        next:     `hoolix connect ${slug}`,
      });
    } else {
      printTitle('Stdio server', `"${metaEarly.name}" (${templateId})`);
      console.log(`  ${ui.accent('○')} This server uses ${ui.accent('stdio transport')} — your MCP client spawns it on demand.`);
      console.log(`  ${ui.muted('No Hoolix host process is needed.')}`);
      console.log('');
      printSection('Wire it into your client');
      printCommand(`hoolix connect ${slug}`);
      printCommand(`hoolix connect ${slug} --client claude-code --yes`);
    }
    process.exit(0);
  }

  // ── stdio transport path ─────────────────────────────────────────────────
  // Runs the MCP server in-process over stdin/stdout (foreground, no spawn).
  // The MCP client spawns this process; stdout/stdin carry the MCP protocol.
  // All human-readable output goes to stderr so it doesn't corrupt the stream.
  const transportIdx = args.indexOf('--transport');
  const transport    = transportIdx !== -1 ? args[transportIdx + 1] : 'http';

  if (transport === 'stdio') {
    const meta = await getServerMetadata(slug).catch(() => null);
    if (!meta) {
      process.stderr.write(`hoolix error: server "${slug}" not found. Run "hoolix list".\n`);
      process.exit(1);
    }

    // Print the client config snippet to stderr (visible when run manually;
    // invisible to the MCP protocol which only reads stdout).
    const clientConfig = {
      mcpServers: {
        [slug]: {
          command: 'hoolix',
          args:    ['start', slug, '--transport', 'stdio'],
        },
      },
    };
    if (json) {
      printJson({
        ok: true,
        slug,
        name: meta.name,
        transport: 'stdio',
        ...clientConfig,
        next: [`Add this config to your MCP client`, `hoolix verify ${slug} --json`],
      });
      return;
    }
    process.stderr.write(`\nhoolix › "${meta.name}" starting in stdio mode\n\n`);
    process.stderr.write('Client config (paste into your MCP client):\n');
    process.stderr.write(JSON.stringify(clientConfig, null, 2) + '\n\n');
    process.stderr.write('Tip: hoolix connect ' + slug + ' --client claude  (auto-writes the config above)\n\n');

    const { startStdioServer } = await import('../mcp/stdio-host.js');
    await startStdioServer(slug);
    return; // startStdioServer never resolves; this is defensive
  }

  // ── HTTP transport path (default) ────────────────────────────────────────
  const meta    = await getServerMetadata(slug);
  const portIdx = args.indexOf('--port');
  const port    = parseInt(args[portIdx + 1] || '0', 10) || (3456 + Math.floor(Math.random() * 400));
  const authKey = meta.authKey;

  if (!json) printTitle('Starting', `Preparing "${meta.name}"`);

  try {
    const { port: actualPort, pid } = await serverManager.start(slug, { port, authKey });

    if (json) {
      printJson({
        ok:        true,
        slug,
        name:      meta.name,
        transport: 'http',
        url:       `http://127.0.0.1:${actualPort}/mcp`,
        port:      actualPort,
        pid,
        mcpServers: {
          [slug]: {
            type:    'streamable-http',
            url:     `http://127.0.0.1:${actualPort}/mcp`,
            headers: { Authorization: `Bearer ${authKey}` },
          },
        },
        next: [`hoolix connect ${slug} --client cursor --yes`, `hoolix verify ${slug} --json`],
      });
      return;
    }

    printTitle('Running', `"${meta.name}" is ready for MCP clients.`);
    printDetails([
      ['Transport', 'Streamable HTTP'],
      ['URL',       `http://127.0.0.1:${actualPort}/mcp`],
      ['Auth',      `Authorization: Bearer ${authKey}`],
      ['PID',       pid],
    ]);
    console.log('');

    printSection('Streamable HTTP client config');
    console.log(JSON.stringify({
      mcpServers: {
        [slug]: {
          type:    'streamable-http',
          url:     `http://127.0.0.1:${actualPort}/mcp`,
          headers: { Authorization: `Bearer ${authKey}` },
        },
      },
    }, null, 2));

    console.log('');
    printSection('stdio client config (Claude Desktop / VS Code)');
    console.log(JSON.stringify({
      mcpServers: {
        [slug]: {
          command: 'hoolix',
          args:    ['start', slug, '--transport', 'stdio'],
        },
      },
    }, null, 2));

    console.log('');
    printSection('Quick checks');
    printCommand(`curl -s http://127.0.0.1:${actualPort}/health`);
    printCommand(`curl -s -H "Authorization: Bearer ${authKey}" -X POST -d '{}' -H 'content-type: application/json' http://127.0.0.1:${actualPort}/mcp`);
    console.log('');
    console.log(`  ${ui.muted('Tip:')} hoolix connect ${slug} --client cursor   (or claude|windsurf|continue|cline|grokbuild|generic; use --project for workspace)`);
    console.log(`  ${ui.muted('Tip:')} hoolix start ${slug} --transport stdio   (for Claude Desktop / VS Code / stdio clients)`);
  } catch (err: any) {
    if (json) {
      printJson({
        ok:    false,
        slug,
        error: err.message || String(err),
        next:  `Run hoolix doctor --json, then retry hoolix start ${slug} --json.`,
      });
      process.exit(1);
    }

    logger.warn('Could not automatically start the host process:', err.message);
    console.log('');
    printSection('Manual start options');
    printCommand(`npx tsx src/mcp/host.ts --slug ${slug} --port ${port} --data-dir ".hoolix/servers/${slug}/data" --auth-key ${authKey}`);
    printCommand(`hoolix start ${slug} --transport stdio`);
    console.log('');
    console.log(`  ${ui.muted('Tip:')} hoolix connect ${slug} --client cursor`);
  }
}
