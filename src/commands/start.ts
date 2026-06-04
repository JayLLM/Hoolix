import { getServerMetadata } from '../core/registry.js';
import { serverManager } from '../process/manager.js';
import { logger } from '../core/logger.js';
import {
  printTitle, printSection, printDetails, printCommand, printJson, ui,
} from '../ui/format.js';

export async function cmdStart(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix start <slug> [--port <n>] --json.' });
    else logger.error('Usage: hoolix start <slug> [--port <n>] [--json]');
    process.exit(1);
  }

  const meta    = await getServerMetadata(slug);
  const portIdx = args.indexOf('--port');
  const port    = parseInt(args[portIdx + 1] || '0', 10) || (3456 + Math.floor(Math.random() * 400));
  const authKey = meta.authKey;

  if (!json) printTitle('Starting', `Preparing "${meta.name}"`);

  try {
    const { port: actualPort, pid } = await serverManager.start(slug, { port, authKey });

    if (json) {
      printJson({
        ok:   true,
        slug,
        name: meta.name,
        url:  `http://127.0.0.1:${actualPort}/mcp`,
        port: actualPort,
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
      ['URL',  `http://127.0.0.1:${actualPort}/mcp`],
      ['Auth', `Authorization: Bearer ${authKey}`],
      ['PID',  pid],
    ]);
    console.log('');

    printSection('MCP client config');
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
    printSection('Quick checks');
    printCommand(`curl -s http://127.0.0.1:${actualPort}/health`);
    printCommand(`curl -s -H "Authorization: Bearer ${authKey}" -X POST -d '{}' -H 'content-type: application/json' http://127.0.0.1:${actualPort}/mcp`);
    console.log('');
    console.log(`  ${ui.muted('Tip:')} hoolix connect ${slug} --client cursor   (or claude|windsurf|continue|cline|grokbuild|generic; use --project for workspace)`);
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
    printSection('Manual start');
    printCommand(`npx tsx src/mcp/host.ts --slug ${slug} --port ${port} --data-dir ".hoolix/servers/${slug}/data" --auth-key ${authKey}`);
    console.log('');
    console.log(`  ${ui.muted('Tip:')} hoolix connect ${slug} --client cursor`);
  }
}
