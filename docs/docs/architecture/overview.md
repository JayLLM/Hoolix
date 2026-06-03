---
sidebar_label: Overview
sidebar_position: 1
---

# Architecture Overview

hoolix turns a documentation URL into a production-grade, authenticated MCP server using the official Model Context Protocol (Streamable HTTP transport).

## High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                           CLI (src/index.ts)                     │
│  create | start | reindex | verify | list | doctor | ...         │
│  @clack prompts + spinners + --json support                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌────────────────┐      ┌─────────────────┐
│  Ingestion    │      │   Registry +   │      │  ServerManager  │
│  (pipeline,   │      │   Paths,       │      │  (process/      │
│   fetchers,   │      │   Config,      │      │   manager.ts)   │
│   chunker...) │      │   Errors       │      │                 │
└───────┬───────┘      └───────┬────────┘      └────────┬────────┘
        │                      │                        │
        │ chunks + stats       │ metadata.json          │ spawn
        ▼                      ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Per-Server Data                          │
│  servers/<slug>/                                                │
│    ├─ metadata.json   (Zod validated, sourceUrl, chunkCount...) │
│    ├─ data/chunks.json (rich metadata + content for RAG)        │
│    └─ .runtime.json   (pid, port, startedAt - transient)        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Host (src/mcp/host.ts)                   │
│  Hono + WebStandardStreamableHTTPServerTransport                │
│  - /health (no auth)                                            │
│  - /mcp    (Bearer or X-MCP-Key required)                       │
│  Tools: search_documentation, read_documentation_page,          │
│         get_table_of_contents                                   │
│  All results include "Source: <url>" for grounding              │
└─────────────────────────────────────────────────────────────────┘
```

## Key Invariants (from AGENTS.md)

- **No source or tsx at runtime**: Packaged `bun build --compile` binaries detect `!process.execPath.includes('node') && !includes('bun')` and re-spawn themselves as `__internal-host`.
- **RAG is Fuse.js + JSON only** in the hot path. LanceDB exists in package.json only as a future path; it is never loaded for normal operation.
- **Every search/read result carries source URLs**.
- **llms.txt / llms-full.txt first-class**: Manifest expansion or full-concat content preferred over scraping.
- **Windows-first reliability**: `env-paths`, `ps-list` + `tree-kill`, real TCP port probes, `.cmd` handling for tsx.

## Data Flow Summary

1. `create` → `ingestDocumentation` (fetch + manifest or full + per-page clean + heading chunk) → `createRAGForServer().indexChunks` → `registerServer`
2. `start` → `ServerManager.start` (choose spawn strategy) → host writes runtime marker + serves
3. MCP client calls → auth middleware → MCP SDK tools → `DocumentationRAG` (direct keyword fast-path or Fuse) → grounded text responses
4. `reindex` / `verify` re-use the same ingestion + RAG paths against the stored `sourceUrl`

## See Also

- [Ingestion Pipeline](./ingestion-pipeline)
- [RAG and MCP Tools](./rag-and-tools)
- [Host & Process Model](./host-and-process)
- [API Reference](../api-reference/core)
- ADRs live in `docs/adr/`: `0001-web-gui-bundled-assets.md`, `0002-pure-node-tui.md`, `0003-optional-hybrid-rag.md`.
