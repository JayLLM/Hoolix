---
sidebar_label: Quick Start
sidebar_position: 2
---

# Quick Start

Create your first MCP server from a documentation site in under two minutes.

## 1. Create a Server

Use a real `llms.txt` or `llms-full.txt` URL. The tool prefers full concatenated content when available.

```bash
hoolix create "xAI Docs" --url https://docs.x.ai/llms.txt --yes
```

For sites with a table-of-contents `llms.txt` (multi-page):

```bash
hoolix create "OpenClaw Docs" --url https://docs.openclaw.ai/llms.txt --yes
```

Expected output includes:
- Chunk count and source type
- Special note when `llms-full.txt` was used ("concatenated documentation")
- Next command hint

## 2. Verify Quality (Recommended)

Before connecting clients, run the built-in verifier. It exercises search, read, and table-of-contents using the same RAG the MCP tools will use.

```bash
hoolix verify xai-docs
```

Look for:
- "RAG searchable: yes"
- Results containing relevant text **and** `Source: https://...` lines
- Non-empty Table of Contents

If results look poor, reindex or try a different source URL.

## 3. Start the Server

```bash
hoolix start xai-docs
```

This prints:
- The exact `mcpServers` JSON snippet for Claude Desktop, Cursor, Windsurf, Grok Build, etc.
- `Authorization: Bearer mcp_...` header value (never stored in registry after display)
- Quick `curl` tests for health and the MCP endpoint
- Hint to use `test/verify-mcp.ts` for local simulation

Copy the JSON block, or better: use the one-command wiring:

```bash
hoolix connect xai-docs --client cursor   # or claude, windsurf, continue, cline, grokbuild
```

This auto-merges (with .bak backup), copies to clipboard, and prints client-specific restart steps + a test prompt that exercises `search_documentation` + grounding.

Then reload/restart your client.

## 4. Test with a Client or curl

Manual health (no auth):

```bash
curl -s http://127.0.0.1:3456/health
```

Authenticated MCP initialize (example):

```bash
curl -s -H "Authorization: Bearer mcp_XXXX" \
  -X POST -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  -H 'content-type: application/json' \
  http://127.0.0.1:3456/mcp
```

For full tool exercising without an MCP client, use the simulator script from the project:

```bash
node --import tsx test/verify-mcp.ts --slug xai-docs
```

## Next Steps

- Use `hoolix connect xai-docs --client cursor` (or your client) for instant wiring.
- Just run `hoolix` (no args) for the interactive TUI dashboard.
- Learn [multi-page + GitHub ingestion](../guides/multi-page-llms)
- See [reindex + verify](./basic-usage#reindexing)
- [Architecture](../architecture/overview) (grounding, hybrid RAG, host model)

Try `hoolix create "Test" --url https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md --yes --hybrid` (or `--embedding-model hybrid-bge-base`) to exercise advanced hybrid (RRF reranking, caches, verify --eval). See the [Advanced Hybrid RAG guide](../guides/advanced-rag).

:::info
Servers are stored under your OS user data directory (via `env-paths`). Run `hoolix doctor` to see exact paths.
:::
