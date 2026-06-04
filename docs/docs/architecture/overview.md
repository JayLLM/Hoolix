---
sidebar_label: Overview
sidebar_position: 1
---

# Architecture Overview

Hoolix turns sources and templates into production-grade MCP servers. The CLI, TUI, and GUI all call shared app services so behavior stays consistent across surfaces.

## High-Level Components

```text
CLI / TUI / GUI
      |
      v
Shared app services
  - servers.ts
  - catalog.ts
  - credentials.ts
  - analytics.ts
  - events/progress
      |
      +--> source definitions + template catalog (14 official templates)
      +--> ingestion pipeline (llms.txt, GitHub, web, custom)
      +--> RAG index (Fuse.js + optional hybrid BGE)
      +--> registry + storage (Zod-validated, env-paths)
      +--> process manager (spawn, health, cross-platform)
      |
      v
MCP host / proxy
  - docs-rag: Streamable HTTP + stdio config
  - mcp-server: stdio spawn via client OR proxy HTTP
  - auth, rate limits, audit, stats
  - search/read/toc tools
```

## Two-Kind Template System

Templates are typed as either `kind: 'docs-rag'` or `kind: 'mcp-server'`. The kind determines the entire server lifecycle:

| Aspect | `docs-rag` | `mcp-server` |
|---|---|---|
| `create` | Runs ingestion → chunking → RAG indexing | Stores run config + credentials; no ingestion |
| `start` | Spawns `__internal-host` HTTP server | Either spawns child stdio (for clients) or `--proxy` wraps it behind HTTP |
| `connect` | Emits `{ type: 'streamable-http', url, headers }` | Emits `{ command, args, env }` stdio config (or HTTP if proxied) |
| `verify` | RAG quality + grounding checks | Credentials present + runtime tool available |
| Credentials | n/a | Stored in `credentials.json` (0600), never in `metadata.json` |

## Folder Map

| Area | Responsibility |
| --- | --- |
| `src/app/` | Shared contracts, progress events, and business services |
| `src/commands/` | Command modules that adapt CLI flags to app services |
| `src/tui/` | Pure-Node terminal dashboard, dynamically imported |
| `src/web/` | Local token-protected GUI and API routes |
| `src/sources/` | Source parsing, validation, and plugin discovery |
| `src/catalog/` | Official templates (docs-rag + mcp-server kinds) |
| `src/ingestion/` | Fetch, clean, discover, chunk, and provenance tagging |
| `src/rag/` | Fuse.js index and optional hybrid semantic search |
| `src/core/` | Paths, config, registry, errors, logger, updater, version |
| `src/process/` | Cross-platform server process management |
| `src/mcp/` | HTTP host, proxy host, stdio, tools, transports, auth, rate, audit |
| `src/lib/` | Shared utilities (auth, embedding) |
| `src/ui/` | CLI formatting and help text |

## Data Model

Each server stores:

- `metadata.json` — slug, name, template backing, sources, index stats, schedule
- `credentials.json` — mcp-server credentials (0600, never exported in bundles)
- `data/chunks.json` — indexed knowledge chunks with source provenance
- Optional `data/embeddings.json` — hybrid RAG vectors
- Source fingerprints and reindex schedule metadata
- `audit.log` and stats files
- `.runtime.json` — transient process marker (disappears on clean stop)

## Core Flow

1. `create` / `install` resolves `--url`, repeated `--source`, or `--template`.
2. App services validate the definition. Credentials are prompted and stored separately.
3. For docs-rag: ingestion fetches each source and annotates chunks with provenance; RAG indexing builds keyword or optional hybrid search.
4. Registry metadata is persisted.
5. `verify` checks quality and grounding (docs-rag) or credential presence (mcp-server).
6. `start` hosts MCP over HTTP, prints stdio config, or `--proxy` wraps the stdio server behind HTTP.
7. `connect`, TUI, and GUI use the same server services for lifecycle operations.

## Key Invariants

- Packaged binaries must not require source files or `tsx`.
- TUI stays dynamically imported and pure Node.
- Search/read/TOC results include source URLs.
- Default RAG stays lightweight; hybrid search is optional and lazy.
- Paths and process management stay cross-platform.
- Persisted and external data is validated with Zod.
- Credentials are stored in a separate 0600 file and are never exported.
- `id-token: write` is scoped to the `publish-npm` CI job only — never workflow-level.

## See Also

- [Ingestion Pipeline](./ingestion-pipeline)
- [RAG and MCP Tools](./rag-and-tools)
- [Host and Process](./host-and-process)
- [CLI Reference](../api-reference/cli)
