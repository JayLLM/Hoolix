---
sidebar_label: Introduction
sidebar_position: 0
---

# Hoolix Documentation

Hoolix is the MCP home base for developers and teams. It turns documentation sites, `llms.txt`, GitHub repositories, official MCP server templates, private sources, and custom source plugins into secure, source-grounded MCP servers.

Use it from the TUI, CLI, or local GUI. All three surfaces share the same server definitions, catalog, ingestion, verification, hosting, analytics, and export logic.

## Start Here

```bash
npm install -g hoolix
hoolix
```

The default TUI is the best first experience. It helps you install a template, create a docs RAG server, launch a trial, browse templates, start MCP hosting, connect a client, verify retrieval quality, and inspect logs.

## What Hoolix Does

- **Installs MCP server templates** in a single command: `hoolix install filesystem`, `github-api`, `postgres`, `brave-search`, `slack`, `puppeteer`, `google-maps`, and more.
- Creates docs RAG MCP servers from single sources, multi-source definitions, and official templates.
- Ingests `llms.txt`, `llms-full.txt`, GitHub repos, regular docs pages, private sources, and custom plugin sources.
- Builds grounded RAG indexes with source URLs and source labels.
- Hosts authenticated MCP over Streamable HTTP or stdio.
- Wraps any stdio mcp-server behind authenticated HTTP with `--proxy` mode (auto-restart, health monitoring).
- Verifies retrieval quality before you wire clients.
- Tracks audit logs and usage analytics.
- Supports incremental and scheduled reindexing.
- Exports and imports team-safe `.hoolix.json` bundles — including multi-server bundles.
- Generates shell tab-completion for bash, zsh, fish, and PowerShell.

## Key Concepts

| Concept | Meaning |
| --- | --- |
| Server | A named MCP server with auth, chunks, stats, audit logs, and lifecycle state |
| Source | A docs, web, llms, GitHub, or custom input to ingest |
| Server Definition | The validated model that records sources, template backing, auth hints, schedules, and options |
| Template | A curated server definition — `docs-rag` (indexes knowledge) or `mcp-server` (config-only, spawns via stdio) |
| Transport | Streamable HTTP or stdio MCP hosting |
| Proxy mode | `hoolix start <slug> --proxy` wraps any stdio server behind authenticated HTTP |
| Verify | Health checks for chunks, samples, grounding, source provenance, and retrieval quality |
| Bundle | A `.hoolix.json` export for sharing servers across machines or teammates |

## Quick Links

- [Installation](./getting-started/installation)
- [Quick Start](./getting-started/quick-start)
- [Creating Servers](./guides/creating-servers)
- [CLI Reference](./api-reference/cli)
- [Architecture Overview](./architecture/overview)
- [Changelog](./changelog)

## Philosophy

Hoolix is optimized for the moment after installation: the binary should work, the TUI should feel welcoming, the first server should be useful, and every answer should cite where it came from.

See [AGENTS.md](https://github.com/JayLLM/hoolix/blob/main/AGENTS.md) for contribution rules, architecture constraints, and the quality bar.
