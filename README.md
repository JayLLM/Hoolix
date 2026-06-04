# Hoolix

**Hoolix is your MCP home base.** Turn documentation sites, `llms.txt`, GitHub repositories, templates, and private knowledge sources into secure, source-grounded MCP servers your agents can trust.

[![npm version](https://img.shields.io/npm/v/hoolix?color=blue)](https://www.npmjs.com/package/hoolix)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build](https://img.shields.io/github/actions/workflow/status/JayLLM/hoolix/release.yml?branch=main)](https://github.com/JayLLM/hoolix/actions)
[![Docs](https://img.shields.io/badge/docs-Docusaurus-25c2a0?logo=docusaurus)](https://jayllm.github.io/hoolix/)

> Forge docs, repos, and internal knowledge into production-grade MCP servers with a beautiful TUI, a scriptable CLI, and a lightweight GUI.

Hoolix helps developers and teams create high-quality RAG-backed MCP servers from real sources. It keeps every answer grounded with source URLs, supports Streamable HTTP and stdio transports, and gives you the daily tools you need: create, verify, start, connect, reindex, monitor, export, and share.

## Why Hoolix?

Agents are only as useful as the context they can reliably reach. Copy-pasted docs go stale, ad hoc MCP servers are hard to verify, and hosted RAG often adds privacy and cost concerns. Hoolix gives you a local-first, open-source path:

| You need | Hoolix gives you |
| --- | --- |
| Fast first run | `hoolix` opens the TUI; `hoolix trial` creates a demo server in one command |
| Trustworthy retrieval | Source-grounded search, page reads, table of contents, and `verify` health checks |
| Flexible source models | Single URLs, multi-source definitions, GitHub repos, private docs, templates, and custom source plugins |
| Real MCP hosting | Authenticated Streamable HTTP plus stdio for local client workflows |
| Team workflows | Usage stats, audit logs, sanitized exports, and importable bundles |
| Power-user automation | `--json` across machine-friendly commands, scheduled reindexing, token budgets, and scriptable lifecycle commands |

## Installation

Prebuilt binaries are the recommended path. They are fast, self-contained, and do not require Node, Bun, `tsx`, or source files after installation.

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/JayLLM/Hoolix/main/install.sh | bash
```

### Windows PowerShell

```powershell
iex (irm https://raw.githubusercontent.com/JayLLM/Hoolix/main/install.ps1)
```

The installer verifies the binary and prints PATH guidance if your current terminal needs to be refreshed.

### Try Without Installing

```bash
npx hoolix trial
```

This is the easiest way to prove the flow on a new machine or in a demo. The full install is still best for daily use.

## Quick Start

### 1. Open The TUI

```bash
hoolix
```

Running `hoolix` with no arguments opens the terminal dashboard. From there you can create servers, start or stop them, verify retrieval quality, copy client configs, launch template flows, and inspect recent logs. It is the friendliest way to learn the product.

If your terminal is non-interactive, Hoolix gracefully falls back to CLI help.

### 2. Create A Trial Server

```bash
hoolix trial
hoolix verify hoolix-trial
hoolix start hoolix-trial
```

`trial` creates a public demo server from known-good sources, so you can test MCP tools before choosing your own docs.

### 3. Connect Your MCP Client

```bash
hoolix connect hoolix-trial --client cursor
```

Supported client targets include Cursor, Claude Desktop, Windsurf, Continue, Cline, Grok Build, and generic JSON output. `connect` creates backups before editing client config files and prints the next step for your client.

### 4. Ask Your Agent

Try:

```text
Use search_documentation to find installation instructions, then cite the source URL.
```

Every Hoolix search/read result includes grounding URLs so the agent can show where the answer came from.

## Create Servers

### Single Source

Old syntax remains fully supported:

```bash
hoolix create "React Docs" --url https://react.dev/llms.txt --yes
```

Use `--url` for a single documentation URL, `llms.txt`, `llms-full.txt`, GitHub URL, or regular docs page.

### Multi-Source

Use additive `--source` flags when one MCP server should combine multiple knowledge bases:

```bash
hoolix create "Frontend Stack" \
  --source docs:https://react.dev/llms.txt \
  --source github:vercel/next.js \
  --yes
```

Each source is stored in the server definition and preserved through reindex, verify, export, import, TUI, and GUI views.

### Template-Backed

Templates are curated starting points for common MCP servers:

```bash
hoolix templates list
hoolix templates info terraform-aws-docs
hoolix create "Terraform AWS" --template terraform-aws-docs --yes
```

Templates can still accept normal inputs such as `--url`, `--header`, `--cookie`, `--hybrid`, and schedules when the template supports them.

### Private Or Authenticated Sources

```bash
hoolix create "Private Docs" \
  --url https://docs.example.com/llms.txt \
  --header "Authorization: Bearer $DOCS_TOKEN" \
  --cookie "session=$DOCS_SESSION" \
  --yes
```

For private GitHub repositories, set `GITHUB_TOKEN` before creating or reindexing.

## Core Concepts

| Concept | Meaning |
| --- | --- |
| Server | A named MCP server with its own slug, index, auth key, audit log, stats, and lifecycle |
| Source | A piece of knowledge to ingest, such as `docs:<url>`, `github:owner/repo`, `llms:<url>`, `web:<url>`, or `custom:<provider>:<value>` |
| Server Definition | The validated, portable model that records sources, template backing, auth hints, schedules, and options |
| Template | An official catalog entry that creates a known-good server shape |
| Transport | How clients talk to the server: authenticated Streamable HTTP or local stdio |
| Verification | Hoolix health checks for chunks, samples, grounding, source status, and retrieval quality |
| Bundle | A `.hoolix.json` export that can be imported elsewhere, optionally stripped of secrets for teams |

## Common Commands

| Command | What it does |
| --- | --- |
| `hoolix` | Open the TUI dashboard |
| `hoolix trial` | Create a one-click demo server |
| `hoolix create "Name" --url <url>` | Create from one source |
| `hoolix create "Name" --source docs:<url> --source github:owner/repo` | Create from multiple sources |
| `hoolix create "Name" --template <id>` | Create from an official template |
| `hoolix templates list` | Browse official templates |
| `hoolix list` / `hoolix info <slug>` | Inspect registered servers |
| `hoolix verify <slug>` | Check source, index, grounding, and retrieval health |
| `hoolix start <slug>` | Start authenticated Streamable HTTP MCP hosting |
| `hoolix start <slug> --transport stdio --json` | Print stdio MCP launch config |
| `hoolix connect <slug> --client cursor` | Wire the server into an MCP client |
| `hoolix reindex <slug>` | Incrementally refresh sources and rebuild the index |
| `hoolix reindex <slug> --schedule daily` | Enable scheduled auto-reindex metadata |
| `hoolix reindex --due --json` | Run servers whose schedule is due |
| `hoolix stats <slug>` | Show usage analytics and top queries |
| `hoolix audit <slug>` | Query raw audit entries |
| `hoolix export <slug> --team --strip-key` | Create a team-safe bundle |
| `hoolix import --file server.hoolix.json` | Import a bundle |
| `hoolix gui` | Open the local web dashboard |
| `hoolix doctor` | Diagnose install, paths, config, runtime, plugins, and source health |

Machine-friendly commands support `--json` so Hoolix works cleanly in scripts and CI.

## MCP Tools

Every hosted Hoolix server exposes:

| Tool | Purpose |
| --- | --- |
| `search_documentation` | Search the indexed sources with keyword, hybrid, and optional token/context budgeting |
| `read_documentation_page` | Read a grounded page or chunk by URL/title |
| `get_table_of_contents` | Explore indexed structure and source sections |

Tool responses include source URLs. Search tools accept token-aware options such as `maxTokens` and `contextWindowTokens` so clients can request appropriately sized context.

## Transports

### Streamable HTTP

```bash
hoolix start react-docs
```

HTTP hosting is authenticated with a per-server bearer key and includes rate limiting, timeouts, and audit logging.

### Stdio

```bash
hoolix start react-docs --transport stdio --json
```

Use stdio for clients that prefer local process transports. The JSON output is designed to be copied into client configuration or consumed by automation.

## TUI And GUI

- `hoolix` launches the TUI by default.
- `hoolix gui` launches a token-protected local dashboard.
- CLI, TUI, and GUI share the same app services, definitions, catalog, verification, analytics, and server lifecycle logic.

Use the TUI for fast daily work, the CLI for scripts and repeatability, and the GUI for visual management, catalog browsing, stats, and playground testing.

## Reliability And Security

- Per-server auth keys with `hoolix rotate`
- Tool timeouts and response guards
- Persistent rate limiting for HTTP hosts
- Append-only audit logs
- Usage analytics via `hoolix stats`
- Incremental reindexing and schedule metadata
- Private source headers and cookies
- Team-safe exports with `--strip-key`
- `doctor` and `verify` health cards for fast diagnosis

## Custom Source Plugins

Hoolix can discover simple source plugin manifests from your data directory or `HOOLIX_SOURCE_PLUGIN_DIR`.

```bash
hoolix create "Internal Handbook" \
  --source custom:handbook:getting-started \
  --yes
```

Plugins map custom source identifiers to supported source kinds such as docs, web, llms, or GitHub. This keeps Hoolix extensible without forcing every team source into core.

## Examples

```bash
# TUI-first daily workflow
hoolix

# One-click first run
hoolix trial
hoolix connect hoolix-trial --client cursor

# Single-source docs server
hoolix create "Astro Docs" --url https://docs.astro.build/llms.txt --yes
hoolix verify astro-docs

# Multi-source project server
hoolix create "Company Platform" \
  --source docs:https://docs.example.com/llms.txt \
  --source github:example/platform \
  --source web:https://status.example.com/docs \
  --yes

# Template-backed server
hoolix create "Hoolix Docs" --template hoolix-docs --yes

# Private docs
hoolix create "Private API" \
  --url https://docs.example.com/private/llms.txt \
  --header "Authorization: Bearer $DOCS_TOKEN" \
  --yes

# Scheduled maintenance
hoolix reindex company-platform --schedule daily --yes
hoolix reindex --due --json

# Team-safe sharing
hoolix export company-platform --team --strip-key --file company-platform.hoolix.json
hoolix import --file company-platform.hoolix.json --slug company-platform-copy --yes
```

## Future Vision

Hoolix is growing toward the definitive application for MCP operations: official server catalogs, richer team libraries, deeper plugin hooks, managed deployment targets, policy-aware source access, and a shared experience across CLI, TUI, GUI, and hosted workflows.

The north star is simple: when a team asks, "How do we make this knowledge available to agents safely?", the answer should be Hoolix.

## Development

```bash
bun install

# Run from source
bun run dev

# Type check
npm run typecheck

# Tests
npm test
npm run test:e2e

# Build native binary
bun run build:binary

# Documentation site
cd docs
npm install
npm start
```

See [AGENTS.md](./AGENTS.md) for architecture rules, contribution expectations, testing guidance, and documentation requirements.

## Limitations

- Hoolix is local-first today. Production public hosting is expected to sit behind your reverse proxy or future hosted deployment path.
- Hybrid semantic search is optional and lazy-loaded. The default index stays fast and lightweight.
- Heavily protected sites may require `--header`, `--cookie`, direct `llms.txt`, or GitHub token access.
- Template and plugin ecosystems are intentionally conservative while the catalog matures.

## Contributing

Contributions are welcome. Please open an issue for substantial changes, keep PRs focused, run tests, and update documentation alongside behavior changes.

## Releasing

Release automation uses `release-it` and GitHub Actions. See [docs/RELEASING.md](./docs/RELEASING.md) for the release checklist and binary publishing workflow.

## License

MIT © Hoolix contributors

---

**Links**: [GitHub](https://github.com/JayLLM/Hoolix) · [Issues](https://github.com/JayLLM/Hoolix/issues) · [Releases](https://github.com/JayLLM/Hoolix/releases)

Made for developers who want agents to find the right paragraph, cite the right URL, and get back to work.
