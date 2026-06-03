---
sidebar_label: Introduction
sidebar_position: 0
---

# hoolix Documentation

**hoolix** turns documentation URLs (especially `llms.txt` and `llms-full.txt`) into fully functional, authenticated MCP servers using the official Model Context Protocol Streamable HTTP transport.

Connect them to Claude, Cursor, Grok Build, Windsurf, or any other MCP-capable agent and get grounded, source-linked answers from your docs.

## Quick Links

- [Installation](./getting-started/installation)
- [Quick Start](./getting-started/quick-start)
- [Architecture Overview](./architecture/overview)
- [API Reference](./api-reference/cli)
- [Changelog](./changelog)

## Key Features

- llms.txt + GitHub-aware (READMEs, docs/, tree with token) ingestion with heading chunking + per-page URLs for grounding
- Fuse.js (default, zero-dep) + optional advanced hybrid (BGE-small/base + RRF rerank, query/embed caches, --hybrid or --embedding-model)
- `connect <slug> --client cursor|claude|...` — auto-merge + backup + clipboard + per-client steps + test prompt
- Full interactive TUI dashboard (default `hoolix`; keys for start/stop/verify/connect/reindex/log tail)
- Secure: per-server keys, `rotate`, advanced in-memory rate limiting (configurable + Retry-After), append-only + queryable/rotated per-server `audit.log` (via `hoolix audit`), response size/timeout guards. Full GITHUB_TOKEN support for private GitHub ingestion.
- Self-contained binaries + Windows-first (ps-list/tree-kill + PowerShell installer)
- `verify` (samples, relevance, grounding quality, hybrid mode demo)
- `reindex`, `doctor --json`, `--json` everywhere, actionable errors
- Gold-standard docs + examples + contribution hygiene (this site + AGENTS.md)

## Philosophy

Production-grade feel from day one:
- Excellent ingestion and RAG quality is the product's reason for existing
- Error states are actionable
- Works out of the box after a simple install
- User experience after installation > developer convenience

See [AGENTS.md](https://github.com/JayLLM/hoolix/blob/main/AGENTS.md) for the full set of rules contributors follow.

## Next Step

[Get started with installation →](./getting-started/installation)
