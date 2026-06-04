import chalk from 'chalk';
import { ui } from './format.js';

export function printHelp(): void {
  console.log(`
${ui.accent('◆')} ${ui.brand} ${chalk.bold('Forge documentation into powerful, secure MCP servers.')}

${chalk.bold('Usage')}
  hoolix [command] [options]

${chalk.bold('Commands')}
  ${ui.accent('create')} [name]         Create server from docs URL (real ingestion + RAG; --yes, --json, --hybrid, --embedding-model)
  ${ui.accent('list')}                  List registered servers (--json)
  ${ui.accent('start')} <slug>          Start the MCP server (Streamable HTTP; --port, --json)
  ${ui.accent('stop')} <slug>           Stop a running server (--json)
  ${ui.accent('info')} <slug>           Show details and masked status info (--json)
  ${ui.accent('connect')} <slug>        Wire server into client (auto-merge + backup for claude/cursor/etc; --client, --project, --json)
  ${ui.accent('rotate')} <slug>         Rotate the Bearer auth key for a server (clients must be updated)
  ${ui.accent('audit')} <slug>          Query audit log (tool calls, rate limits, searches) with filters (--json, --limit, --tool, --since)
  ${ui.accent('export')} <slug>         Export server metadata + chunks to a .hoolix.json bundle (--file, --include-key, --json)
  ${ui.accent('import')} --file <path>  Import a .hoolix.json bundle (--slug, --yes, --json)
  ${ui.accent('delete')} <slug>         Remove server and data (--yes, --json)
  ${ui.accent('reindex')} <slug>        Re-fetch source and rebuild the RAG index (--yes, --json, --hybrid, --embedding-model)
  ${ui.accent('verify')} <slug>         Check RAG health, samples, grounding + optional --eval / --json
  ${ui.accent('gui')}                   Launch web GUI / dashboard in browser (port 8080, token auth, create/manage/playground)
  ${ui.accent('doctor')} [--json]       Diagnose installation, paths, config, and runtime
  ${ui.accent('update')}                Check for and install the latest version (--json)
  ${ui.accent('uninstall')} [--yes]     Completely remove hoolix, all servers/data, the binary, and PATH entries (--json)
  ${ui.accent('version')}               Print the current version

${chalk.bold('Examples')}
  ${ui.accent('›')} hoolix create "My Docs" --url https://example.com/llms.txt --yes
  ${ui.accent('›')} hoolix create "My Docs" --url https://example.com/llms.txt --yes --json
  ${ui.accent('›')} hoolix verify my-docs
  ${ui.accent('›')} hoolix start my-docs
  ${ui.accent('›')} hoolix connect my-docs --client cursor
  ${ui.accent('›')} hoolix rotate my-docs
  ${ui.accent('›')} hoolix audit my-docs --limit 20 --json
  ${ui.accent('›')} hoolix export my-docs --file my-docs.hoolix.json
  ${ui.accent('›')} hoolix import --file my-docs.hoolix.json --slug my-docs-copy --json
  ${ui.accent('›')} hoolix gui
  ${ui.accent('›')} hoolix uninstall --yes
  ${ui.accent('›')} hoolix doctor --json

${chalk.bold('Status')}
  ${ui.success('✓')} llms.txt-first + GitHub-aware ingestion with heading-aware chunking + full GITHUB_TOKEN for private repos (raw + tree)
  ${ui.success('✓')} Fuse.js (default) + optional hybrid BGE-small RAG; every result includes Source URLs
  ${ui.success('✓')} Hono + official MCP Streamable HTTP + per-server auth + tool timeouts + advanced rate limiting + queryable audit.log
  ${ui.success('✓')} Self-contained binaries + interactive TUI (default when no command) + web GUI ('hoolix gui')
  ${ui.success('✓')} connect + rotate + audit + browser dashboard for production client wiring, security, and visual management
`);
}
