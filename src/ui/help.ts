import chalk from 'chalk';
import { ui } from './format.js';

export function printHelp(): void {
  console.log(`
${ui.accent('◆')} ${ui.brand} ${chalk.bold('The MCP server platform. Docs, tools, databases, and AI — one command.')}

${chalk.bold('Usage')}
  hoolix [command] [options]

${chalk.bold('Server management')}
  ${ui.accent('(no command)')}          Open the TUI dashboard
  ${ui.accent('create')} [name]         Create from --url, --source, or --template (docs-rag + mcp-server kinds)
  ${ui.accent('install')} <template> [values…] Sugar for create --template (positional inputs; --name, --yes)
  ${ui.accent('templates')}             Browse official templates: list, info <id> (--json)
  ${ui.accent('list')}                  List registered servers (--json)
  ${ui.accent('info')} <slug>           Show definition, sources/config, index, and status (--json)
  ${ui.accent('delete')} <slug>         Remove server and data (--yes, --json)

${chalk.bold('Lifecycle')}
  ${ui.accent('start')} <slug>          Start MCP hosting (--port, --transport http|stdio, --json)
  ${ui.accent('stop')} <slug>           Stop a running server (--json)
  ${ui.accent('reindex')} <slug>        Refresh sources and rebuild RAG index (docs-rag only; --force, --schedule, --due)
  ${ui.accent('verify')} <slug>         Check health, grounding, and retrieval quality (--json)
  ${ui.accent('rotate')} <slug>         Rotate the Bearer auth key (clients must be updated after)

${chalk.bold('Client integration')}
  ${ui.accent('connect')} <slug>        Wire into a client with backup/merge (--client claude|claude-code|cursor|vscode|…, --dry-run, --json)
  ${ui.accent('clients list')}          Show all supported clients with detection status and config paths (--json)
  ${ui.accent('client status')}         Show which Hoolix servers are wired in each detected client (--json)
  ${ui.accent('secrets list')} <slug>   Show masked credential keys for an mcp-server (--json)
  ${ui.accent('secrets set')} <slug> <key> [val]  Add or rotate a credential; prompts if value omitted (--yes, --json)
  ${ui.accent('secrets remove')} <slug> <key>     Delete a stored credential (--yes, --json)
  ${ui.accent('trial')}                 One-click demo server for first runs and npx demos (--json)

${chalk.bold('Observability')}
  ${ui.accent('stats')} <slug>          Analytics dashboard: top queries, pages, health (--days N, --json)
  ${ui.accent('audit')} <slug>          Query raw audit log (--limit, --tool, --since, --json)

${chalk.bold('Import / Export')}
  ${ui.accent('export')} <slug>         Export a .hoolix.json bundle (--team, --strip-key, --file, --json)
  ${ui.accent('import')} --file <path>  Import a .hoolix.json bundle (--slug, --yes, --json)

${chalk.bold('System')}
  ${ui.accent('gui')}                   Launch the local web dashboard (token auth, catalog, stats, playground)
  ${ui.accent('doctor')} [--json]       Diagnose installation, paths, config, and runtime
  ${ui.accent('update')}                Check for and install the latest version (--json)
  ${ui.accent('uninstall')} [--yes]     Completely remove hoolix, servers/data, binary, and PATH entries
  ${ui.accent('version')}               Print the current version

${chalk.bold('Examples — MCP server templates (new)')}
  ${ui.accent('›')} hoolix templates list
  ${ui.accent('›')} hoolix templates info filesystem
  ${ui.accent('›')} hoolix install filesystem /Users/jay/projects --yes
  ${ui.accent('›')} hoolix install github-api --yes            (credentials prompted interactively)
  ${ui.accent('›')} hoolix install memory --name "My Memory" --yes
  ${ui.accent('›')} hoolix install postgres --credential databaseUrl=postgresql://… --yes
  ${ui.accent('›')} hoolix create "My DB" --template postgres --credential databaseUrl=postgresql://… --yes --json
  ${ui.accent('›')} hoolix connect my-files --client claude
  ${ui.accent('›')} hoolix connect my-github --client claude-code --yes
  ${ui.accent('›')} hoolix connect my-files --dry-run
  ${ui.accent('›')} hoolix clients list
  ${ui.accent('›')} hoolix client status
  ${ui.accent('›')} hoolix secrets list my-github
  ${ui.accent('›')} hoolix secrets set my-github githubToken ghp_newtoken123
  ${ui.accent('›')} hoolix secrets set my-db databaseUrl   (interactive masked prompt)
  ${ui.accent('›')} hoolix secrets remove my-github githubToken --yes
  ${ui.accent('›')} hoolix export my-github --file my-github.hoolix.json
  ${ui.accent('›')} hoolix import my-github.hoolix.json --yes

${chalk.bold('Examples — Docs RAG (existing)')}
  ${ui.accent('›')} hoolix create "React Docs" --template docs-rag --url https://react.dev/llms.txt --yes
  ${ui.accent('›')} hoolix create "Stack" --source docs:https://react.dev/llms.txt --source github:vercel/next.js --yes
  ${ui.accent('›')} hoolix create "Private Docs" --url https://docs.example.com/llms.txt --header "Authorization: Bearer $TOKEN" --yes
  ${ui.accent('›')} hoolix start my-docs
  ${ui.accent('›')} hoolix connect my-docs --client cursor

${chalk.bold('Status')}
  ${ui.success('✓')} Two template kinds: docs-rag (RAG search) and mcp-server (filesystem, GitHub, Postgres, SQLite, memory)
  ${ui.success('✓')} Credentials stored separately in credentials.json (0600) with env-var auto-detection
  ${ui.success('✓')} llms.txt-first, GitHub-aware ingestion; Fuse.js + optional hybrid BGE; grounded Source URLs
  ${ui.success('✓')} Streamable HTTP + stdio MCP transports; auth, rate limiting, audit, stats
  ${ui.success('✓')} Self-contained binaries, TUI, web GUI, connect, rotate, export/import, doctor
`);
}
