import chalk from 'chalk';
import { ui } from './format.js';

export function printHelp(): void {
  console.log(`
${ui.accent('◆')} ${ui.brand} ${chalk.bold('Your MCP home base for docs, sources, templates, and teams.')}

${chalk.bold('Usage')}
  hoolix [command] [options]

${chalk.bold('Commands')}
  ${ui.accent('(no command)')}          Open the TUI dashboard
  ${ui.accent('trial')}                 Create a one-click demo server for first runs and npx demos (--json)
  ${ui.accent('create')} [name]         Create from --url, repeated --source, or --template (private --header/--cookie supported)
  ${ui.accent('templates')}             Browse official templates: list, info <id> (--json)
  ${ui.accent('list')}                  List registered servers (--json)
  ${ui.accent('start')} <slug>          Start MCP hosting (--port, --transport http|stdio, --json)
  ${ui.accent('stop')} <slug>           Stop a running server (--json)
  ${ui.accent('info')} <slug>           Show server definition, sources, index, and masked status info (--json)
  ${ui.accent('connect')} <slug>        Wire into a client with backup/merge (cursor/claude/etc; --client, --project, --json)
  ${ui.accent('rotate')} <slug>         Rotate the Bearer auth key for a server (clients must be updated)
  ${ui.accent('stats')} <slug>          Show analytics: top queries, pages, health, and activity chart (--days N, --json)
  ${ui.accent('audit')} <slug>          Query raw audit log entries with filters (--json, --limit, --tool, --since)
  ${ui.accent('export')} <slug>         Export a .hoolix.json bundle (--team, --strip-key, --include-key, --file, --json)
  ${ui.accent('import')} --file <path>  Import a .hoolix.json bundle (--slug, --yes, --json)
  ${ui.accent('delete')} <slug>         Remove server and data (--yes, --json)
  ${ui.accent('reindex')} <slug>        Incrementally refresh sources and rebuild RAG (--force, --schedule hourly|daily|off, --due)
  ${ui.accent('verify')} <slug>         Check source, chunk, sample, grounding, and retrieval health (--eval, --json)
  ${ui.accent('gui')}                   Launch the local web dashboard (token auth, catalog, stats, playground)
  ${ui.accent('doctor')} [--json]       Diagnose installation, paths, config, and runtime
  ${ui.accent('update')}                Check for and install the latest version (--json)
  ${ui.accent('uninstall')} [--yes]     Completely remove hoolix, all servers/data, the binary, and PATH entries (--json)
  ${ui.accent('version')}               Print the current version

${chalk.bold('Examples')}
  ${ui.accent('›')} hoolix
  ${ui.accent('›')} npx hoolix trial --json
  ${ui.accent('›')} hoolix create "My Docs" --url https://example.com/llms.txt --yes
  ${ui.accent('›')} hoolix create "Stack" --source docs:https://react.dev/llms.txt --source github:vercel/next.js --yes
  ${ui.accent('›')} hoolix templates list
  ${ui.accent('›')} hoolix create "React Docs" --template docs-rag --url https://react.dev/llms.txt --yes
  ${ui.accent('›')} hoolix create "Private Docs" --url https://docs.example.com/llms.txt --header "Authorization: Bearer $TOKEN" --yes
  ${ui.accent('›')} hoolix export my-docs --team --strip-key --file team-docs.hoolix.json
  ${ui.accent('›')} hoolix reindex my-docs --schedule daily --yes
  ${ui.accent('›')} hoolix reindex --due --json
  ${ui.accent('›')} hoolix create "My Docs" --url https://example.com/llms.txt --yes --json
  ${ui.accent('›')} hoolix verify my-docs
  ${ui.accent('›')} hoolix start my-docs
  ${ui.accent('›')} hoolix start my-docs --transport stdio --json
  ${ui.accent('›')} hoolix connect my-docs --client cursor
  ${ui.accent('›')} hoolix rotate my-docs
  ${ui.accent('›')} hoolix audit my-docs --limit 20 --json
  ${ui.accent('›')} hoolix export my-docs --file my-docs.hoolix.json
  ${ui.accent('›')} hoolix import --file my-docs.hoolix.json --slug my-docs-copy --json
  ${ui.accent('›')} hoolix gui
  ${ui.accent('›')} hoolix uninstall --yes
  ${ui.accent('›')} hoolix doctor --json

${chalk.bold('Status')}
  ${ui.success('✓')} llms.txt-first, GitHub-aware, multi-source ingestion with source provenance
  ${ui.success('✓')} Official templates, server definitions, private source auth, and custom source plugins
  ${ui.success('✓')} Fuse.js default RAG + optional hybrid BGE search; every result includes Source URLs
  ${ui.success('✓')} Streamable HTTP + stdio MCP transports with auth, timeouts, persistent rate limiting, audit, and stats
  ${ui.success('✓')} Self-contained binaries, TUI by default, web GUI, connect, rotate, export/import, doctor, and verify
`);
}
