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
  - servers
  - catalog
  - analytics
  - events/progress
      |
      +--> source definitions + template catalog
      +--> ingestion pipeline
      +--> RAG index
      +--> registry + storage
      +--> process manager
      |
      v
MCP host
  - Streamable HTTP
  - stdio config
  - auth, rate limits, audit, stats
  - search/read/toc tools
```

## Folder Map

| Area | Responsibility |
| --- | --- |
| `src/app/` | Shared contracts, progress events, and business services |
| `src/commands/` | Command modules that adapt CLI flags to app services |
| `src/tui/` | Pure-Node terminal dashboard, dynamically imported |
| `src/web/` | Local token-protected GUI and API routes |
| `src/sources/` | Source parsing, validation, and plugin discovery |
| `src/catalog/` | Official templates |
| `src/ingestion/` | Fetch, clean, discover, chunk, and provenance tagging |
| `src/rag/` | Fuse.js index and optional hybrid search |
| `src/core/` | Paths, config, registry, errors, logger, version |
| `src/process/` | Cross-platform server process management |
| `src/mcp/` | MCP host, tools, transports, auth, rate, audit, stats |

## Data Model

Each server stores:

- `metadata.json`
- optional `definition`
- `data/chunks.json`
- optional hybrid embeddings
- source fingerprints and reindex schedule metadata
- audit and stats files
- transient runtime markers

Legacy single-source metadata remains supported. When loaded, it is treated as a one-source server definition.

## Core Flow

1. `create` resolves `--url`, repeated `--source`, or `--template`.
2. App services validate the definition.
3. Ingestion fetches each source and annotates chunks with provenance.
4. RAG indexing builds keyword or optional hybrid search.
5. Registry metadata is persisted.
6. `verify` checks quality and grounding.
7. `start` hosts MCP over HTTP or prints stdio config.
8. `connect`, TUI, and GUI use the same server services for lifecycle operations.

## Key Invariants

- Packaged binaries must not require source files or `tsx`.
- TUI stays dynamically imported and pure Node.
- Search/read/TOC results include source URLs.
- Default RAG stays lightweight; hybrid search is optional and lazy.
- Paths and process management stay cross-platform.
- Persisted and external data is validated with Zod.

## See Also

- [Ingestion Pipeline](./ingestion-pipeline)
- [RAG and MCP Tools](./rag-and-tools)
- [Host and Process](./host-and-process)
- [CLI Reference](../api-reference/cli)
