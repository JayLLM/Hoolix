# Hoolix

**Install, host, and share every MCP server — in one command.**

[![npm version](https://img.shields.io/npm/v/hoolix?color=blue)](https://www.npmjs.com/package/hoolix)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build](https://img.shields.io/github/actions/workflow/status/JayLLM/hoolix/release.yml?branch=main)](https://github.com/JayLLM/hoolix/actions)
[![Docs](https://img.shields.io/badge/docs-Docusaurus-25c2a0?logo=docusaurus)](https://jayllm.github.io/hoolix/)

> Your MCP home base. Zero config for the official servers. Production-grade hosting, credentials, and sharing for everything else.

Hoolix helps developers and teams create high-quality RAG-backed MCP servers from real sources, install curated MCP server templates (filesystem, GitHub, Postgres, Brave Search, Slack, and more), and aggregate them into one local MCP gateway. Every answer is grounded with source URLs, transports support Streamable HTTP and stdio, and you get the full daily toolkit: create, verify, start, connect, gateway, reindex, monitor, bundle, export, and share.

## Why Hoolix?

Agents are only as useful as the context they can reliably reach. Copy-pasted docs go stale, ad hoc MCP servers are hard to verify, and hosted RAG often adds privacy and cost concerns. Hoolix gives you a local-first, open-source path:

| You need | Hoolix gives you |
| --- | --- |
| Fast first run | `hoolix` opens the TUI; `hoolix trial` creates a demo server in one command |
| Trustworthy retrieval | Source-grounded search, page reads, table of contents, and `verify` health checks |
| Popular MCP server templates | `hoolix install fetch`, `filesystem`, `github-api`, `postgres`, `brave-search`, `slack`, and 9 more |
| Flexible source models | Single URLs, multi-source definitions, GitHub repos, private docs, and custom source plugins |
| Real MCP hosting | Authenticated Streamable HTTP plus stdio; proxy mode wraps any stdio server behind HTTP |
| Unified gateway | `hoolix gateway` exposes many configured MCP servers through one authenticated endpoint |
| Team workflows | Usage stats, audit logs, multi-server bundles, and sanitized exports |
| Power-user automation | `--json` across machine-friendly commands, shell completions, scheduled reindexing, and scriptable lifecycle |

## Installation

### Recommended: npm (provenance-verified)

```bash
npm install -g hoolix
```

This installs the published npm package with [npm provenance](https://docs.npmjs.com/generating-provenance-statements) — the cryptographic chain from source to package is public and verifiable.

```bash
hoolix doctor     # verify the installation
hoolix            # open the TUI
```

**Beta / pre-release:**
```bash
npm install -g hoolix@next
```

### Shell Completions (optional but great)

After installing, add tab-completion for your shell:

```bash
# bash  — add to ~/.bashrc
eval "$(hoolix completion bash)"

# zsh   — add to ~/.zshrc
eval "$(hoolix completion zsh)"

# fish  — add to ~/.config/fish/config.fish
hoolix completion fish | source

# PowerShell — add to $PROFILE
hoolix completion powershell | Invoke-Expression
```

### Standalone Binary (Linux / macOS / Windows)

Self-contained binaries require no Node.js, npm, or source files:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/JayLLM/hoolix/main/install.sh | bash

# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/JayLLM/hoolix/main/install.ps1 | iex
```

Binaries include SHA-256 checksums for verification. Download `SHA256SUMS` from [GitHub Releases](https://github.com/JayLLM/hoolix/releases) and run:

```bash
# Linux
sha256sum --check SHA256SUMS

# macOS
shasum -a 256 -c SHA256SUMS
```

### Try Without Installing

```bash
npx hoolix trial
```

This is the easiest way to prove the flow on a new machine or in a demo. The full install is still best for daily use.

## Quick Start

### 1. Open the TUI

```bash
hoolix
```

Running `hoolix` with no arguments opens the terminal dashboard. From there you can create servers, start or stop them, verify retrieval quality, copy client configs, launch template flows, and inspect recent logs.

### 2. Install an MCP Server Template

Templates are curated, one-command installs for common tools:

```bash
hoolix install fetch --yes               # web browsing / URL fetching (zero credentials)
hoolix install filesystem /Users/you/projects --yes
hoolix install github-api --yes          # prompts for GITHUB_TOKEN
hoolix install brave-search --yes        # prompts for BRAVE_API_KEY
hoolix install postgres --credential databaseUrl=postgresql://... --yes
hoolix install slack --yes               # prompts for bot token
hoolix install memory --yes
```

Browse all 15 official templates:

```bash
hoolix templates list
hoolix templates info fetch
hoolix templates info brave-search
```

### 3. Create a Docs RAG Server

```bash
hoolix create "React Docs" --url https://react.dev/llms.txt --yes
hoolix verify react-docs
hoolix start react-docs
```

### 4. Connect Your MCP Client

```bash
hoolix connect react-docs --client cursor
hoolix connect my-github --client claude
```

Supported client targets include Cursor, Claude Desktop, Claude Code, VS Code, Windsurf, Continue, Cline, Grok Build, and generic JSON output. `connect` creates backups before editing client config files.

### One Gateway For Every Agent

After installing and configuring template-backed MCP servers, create one local gateway that agents can share:

```bash
hoolix gateway create my-tools --include github --include filesystem --include brave-search
hoolix gateway start my-tools
hoolix gateway connect my-tools --client codex
```

The gateway runs a single authenticated Streamable HTTP MCP endpoint, lists tools with namespaces such as `github.search_issues` and `filesystem.read_file`, and writes gateway audit/rate-limit data separately from backing servers.

### 5. Ask Your Agent

```text
Use search_documentation to find installation instructions, then cite the source URL.
```

Every Hoolix search/read result includes grounding URLs so the agent can show where the answer came from.

## Create Servers

### Template (Recommended Starting Point)

```bash
hoolix templates list
hoolix create "Brave Search" --template brave-search --yes
# or shorthand:
hoolix install brave-search --yes
```

### Single Source

```bash
hoolix create "React Docs" --url https://react.dev/llms.txt --yes
```

### Multi-Source

```bash
hoolix create "Frontend Stack" \
  --source docs:https://react.dev/llms.txt \
  --source github:vercel/next.js \
  --yes
```

### Private or Authenticated Sources

```bash
hoolix create "Private Docs" \
  --url https://docs.example.com/llms.txt \
  --header "Authorization: Bearer $DOCS_TOKEN" \
  --cookie "session=$DOCS_SESSION" \
  --yes
```

## Core Concepts

| Concept | Meaning |
| --- | --- |
| Server | A named MCP server with its own slug, index, auth key, audit log, stats, and lifecycle |
| Source | A piece of knowledge to ingest: `docs:`, `github:`, `llms:`, `web:`, or `custom:` |
| Template | An official catalog entry — either a `docs-rag` (knowledge indexing) or `mcp-server` (config-only) server shape |
| Transport | How clients talk to the server: authenticated Streamable HTTP or local stdio |
| Proxy mode | `hoolix start <slug> --proxy` wraps any stdio mcp-server behind authenticated HTTP |
| Bundle | A `.hoolix.json` export that can be imported elsewhere, stripped of secrets for teams |

## Common Commands

| Command | What it does |
| --- | --- |
| `hoolix` | Open the TUI dashboard |
| `hoolix trial` | Create a one-click demo server |
| `hoolix install <template>` | Install an official MCP server template in one command |
| `hoolix templates list` | Browse all 15 official templates |
| `hoolix create "Name" --url <url>` | Create from one source |
| `hoolix create "Name" --source docs:<url> --source github:owner/repo` | Create from multiple sources |
| `hoolix list` | Inspect registered servers with live status |
| `hoolix verify <slug>` | Check source, index, grounding, and retrieval health |
| `hoolix start <slug>` | Start authenticated Streamable HTTP MCP hosting |
| `hoolix start <slug> --proxy` | Proxy an mcp-server over authenticated HTTP |
| `hoolix connect <slug> --client cursor` | Wire the server into an MCP client |
| `hoolix gateway create <name> --include <slug>` | Aggregate configured mcp-server instances behind one endpoint |
| `hoolix gateway start <name>` | Start the unified gateway HTTP host |
| `hoolix gateway connect <name> --client codex` | Wire any MCP client to the single gateway |
| `hoolix secrets set <slug> <key>` | Store or rotate a credential (masked, 0600) |
| `hoolix reindex <slug>` | Refresh sources and rebuild the index |
| `hoolix bundle export <slugs…>` | Export multiple servers into one bundle |
| `hoolix bundle import <file>` | Import a multi-server bundle |
| `hoolix completion bash\|zsh\|fish\|powershell` | Generate shell tab-completion |
| `hoolix stats <slug>` | Usage analytics and top queries |
| `hoolix audit <slug>` | Raw audit entries for security review |
| `hoolix export <slug> --team --strip-key` | Create a team-safe bundle |
| `hoolix import --file server.hoolix.json` | Import a bundle |
| `hoolix gui` | Open the local web dashboard |
| `hoolix doctor` | Diagnose install, paths, config, runtime, and proxy status |
| `hoolix update` | Self-update the binary (SHA-256 verified) |

Machine-friendly commands support `--json` so Hoolix works cleanly in scripts and CI.

## MCP Tools

Every hosted Hoolix server exposes:

| Tool | Purpose |
| --- | --- |
| `search_documentation` | Search the indexed sources with keyword, hybrid, and optional token/context budgeting |
| `read_documentation_page` | Read a grounded page or chunk by URL/title |
| `get_table_of_contents` | Explore indexed structure and source sections |

Tool responses include source URLs. Search tools accept token-aware options such as `maxTokens` and `contextWindowTokens`.

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

Use stdio for clients that prefer local process transports.

### Proxy Mode (mcp-server templates)

```bash
hoolix start my-github --proxy
```

Proxy mode wraps any stdio mcp-server behind an authenticated Hono HTTP endpoint, with auto-restart on crash (exponential backoff), 30-second health monitoring, and SSE event wrapping. The `hoolix list` column shows `proxy:PORT` for running proxy servers.

## TUI and GUI

- `hoolix` launches the TUI by default.
- `hoolix gui` launches a token-protected local dashboard.
- CLI, TUI, and GUI share the same app services, definitions, catalog, verification, analytics, and server lifecycle logic.

## Reliability and Security

- Per-server auth keys with `hoolix rotate`
- Tool timeouts and response guards
- Persistent rate limiting for HTTP hosts
- Append-only audit logs
- Usage analytics via `hoolix stats`
- Incremental reindexing and schedule metadata
- Private source headers and cookies
- Team-safe exports with `--strip-key`
- `doctor` and `verify` health cards for fast diagnosis
- SHA-256 checksum verification on binary updates and installs
- Optional GPG `.asc` signatures on GitHub Release assets

## Multi-Server Bundles

Share entire setups across machines or teammates:

```bash
# Export multiple servers into one file (credentials are never exported)
hoolix bundle export my-docs my-github my-db --output team.hoolix.json

# Import on another machine (prints hoolix secrets set instructions)
hoolix bundle import team.hoolix.json --yes
```

## Custom Source Plugins

```bash
hoolix create "Internal Handbook" \
  --source custom:handbook:getting-started \
  --yes
```

Plugins map custom source identifiers to supported source kinds. Place manifests in `~/.hoolix/templates/` or set `HOOLIX_SOURCE_PLUGIN_DIR`.

## Examples

```bash
# TUI-first daily workflow
hoolix

# Install MCP server templates
hoolix install filesystem /Users/you/projects --yes
hoolix install github-api --yes
hoolix install brave-search --yes
hoolix install postgres --credential databaseUrl=postgresql://localhost/mydb --yes
hoolix install memory --yes

# One-click first run
hoolix trial
hoolix connect hoolix-trial --client cursor

# Docs RAG server from llms.txt
hoolix create "Astro Docs" --url https://docs.astro.build/llms.txt --yes
hoolix verify astro-docs

# Multi-source project server
hoolix create "Company Platform" \
  --source docs:https://docs.example.com/llms.txt \
  --source github:example/platform \
  --yes

# Proxy an mcp-server over HTTP
hoolix start my-github --proxy

# Connect to clients
hoolix connect my-docs --client cursor
hoolix connect my-github --client claude-code --yes

# Multi-server bundle for teammates
hoolix bundle export my-docs my-github --output team.hoolix.json --team
hoolix bundle import team.hoolix.json --yes

# Scheduled maintenance
hoolix reindex company-platform --schedule daily --yes
hoolix reindex --due --json
```

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

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md).

## Releasing

Release automation uses `release-it` and GitHub Actions. See [docs/RELEASING.md](./docs/RELEASING.md) for the full release checklist, npm publish flow, binary matrix, and free signing process.

## License

MIT © Hoolix contributors

---

**Links**: [npm](https://www.npmjs.com/package/hoolix) · [GitHub](https://github.com/JayLLM/hoolix) · [Docs](https://jayllm.github.io/hoolix/) · [Issues](https://github.com/JayLLM/hoolix/issues) · [Releases](https://github.com/JayLLM/hoolix/releases)

Made for developers who want agents to find the right paragraph, cite the right URL, and get back to work.
