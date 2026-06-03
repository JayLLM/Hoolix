---
sidebar_label: CLI
sidebar_position: 1
---

# CLI API Reference

The CLI is a hand-rolled dispatcher (no oclif) in `src/index.ts`. Every command that produces machine-consumable output supports `--json`.

## Global

- `hoolix --version`, `-v`, `version` — prints `VERSION` from `src/core/version.ts`
- `hoolix --help`, `-h`, `help` — prints usage + current status summary
- `hoolix doctor [--json]` — runs 6+ checks (runtime, paths with write test, config, registry, process manager, network). Exits 1 on failure unless `--json`.

## create

```bash
hoolix create [name] [--url <url>] [--yes] [--json]
```

Interactive prompts for name and URL when omitted. Uses `slugify`, `ingestDocumentation({maxPages:80, maxChunks:6000})`, builds Fuse index, then `registerServer`.

On success prints slug, chunk count, and "from N page(s)" or "from llms-full.txt (concatenated documentation)". With `--json`, emits a single machine-readable object and requires `--yes` so scripts never hang on confirmation.

Errors: `ServerAlreadyExistsError` is turned into a friendly message.

## list

```bash
hoolix list [--json]
```

Prints table (or JSON array) of all servers from registry. After table, performs a light `validateServerState` pass and prints warnings for any issues (missing chunks.json, count mismatch).

## start

```bash
hoolix start <slug> [--port <n>] [--json]
```

Loads metadata + authKey, calls `serverManager.start`, prints ready banner + exact `mcpServers` JSON block for clients + curl examples + verify hint. With `--json`, emits the usable client config and skips background update-check chatter.

On spawn failure (common in raw dev), prints manual `npx tsx ...` command.

## verify

```bash
hoolix verify <slug> [--eval] [--json]
```

- Prints registry chunk count + source
- Runs `validateServerState`
- Loads RAG and does a quick searchability probe
- Runs 3 sample searches and prints top hit + first 140 chars + `Source:`
- Prints reconstructed TOC count + top level-1 entries
- Final guidance line about grounding
- With `--json`, emits machine-readable validation, searchability, grounding percentage, samples, TOC count, and embedding model for CI/e2e gates

Intended as the primary self-service quality check before wiring a client.

## reindex

```bash
hoolix reindex <slug> [--yes] [--json]
```

Requires `sourceUrl` in metadata. Re-runs `ingestDocumentation` from that URL (same options as create), rebuilds RAG, updates `chunkCount` + `sourceType`. Auth key and timestamps preserved. Reports pagesInfo the same way create does. With `--json`, requires `--yes` and emits one result object.

## connect

```bash
hoolix connect <slug> [--client claude|cursor|windsurf|continue|cline|grokbuild|generic] [--project] [--yes] [--json] [--port N]
```

Computes the exact streamable-http + Bearer entry (prefers live port from status, falls back to --port or prompt/suggestion). 

For supported clients: auto-detects preferred, merges into the client's mcpServers file (never overwrites other servers), writes a timestamped .bak backup, copies snippet to clipboard (cross-platform), prints client-specific restart steps + a ready test prompt that exercises search_documentation + grounding.

Generic: just emits the JSON block.

## rotate

```bash
hoolix rotate <slug> [--yes] [--json]
```

Generates a fresh `mcp_` key, updates metadata. Prints the new key explicitly, masks the old key, and warns that any running instance must be stopped + restarted. With `--json`, requires `--yes` and emits the new key plus next commands.

## audit

```bash
hoolix audit <slug> [--json] [--limit N] [--tool <tool>] [--since <2026-...>]
```

Queries the append-only per-server `audit.log` (written by the MCP host on every tool invocation + rate limit events).

- `--json` for machine consumption (includes full entries).
- Filters for recent activity, specific tools (e.g. `search_documentation`), or time prefix.
- Entries include: ts, tool, query snippet (truncated), hits, rate_limited details, etc.
- Log is rotated/truncated server-side when > ~5k lines (keeps recent 80%).

This is the foundation for security review, abuse detection, and hosted usage accounting.

## Other Commands / Global Behavior

- `info <slug> [--json]` — metadata + live status from `serverManager.getStatus` + validation warnings + reindex hint. Shows the actual `embeddingModel` (e.g. `hybrid-bge-base` or `fuse`) and masks auth keys.
- `stop <slug> [--json]` — `serverManager.stop` (tree-kill)
- `delete <slug> [--yes] [--json]` — removes from registry index and (by default) the entire on-disk server dir
- `update [--json]` — runs `performUpdate` (only works for compiled binaries)
- `uninstall [--yes] [--json]` — removes data and, for compiled installs, prepares/removes the binary.
- Default / no arg / `tui` / `dashboard` — launches the interactive pure-Node TUI (list + live status + keyboard actions for start/stop/verify/connect/info/reindex + log tail). Requires TTY; graceful text fallback in CI/pipes. Implemented with dynamic import (no React) so non-TUI commands pay no cost.
- `doctor` now surfaces connect hints on healthy installs and embedding model info.

Create / reindex accept `--hybrid` or `--embedding-model hybrid-bge-base` (respects config `preferredEmbedding`). This enables the full advanced hybrid feature set (RRF reranking, embed/query caches, multi-model support, eval). `verify --eval` provides built-in relevance/latency/mode-comparison proxy. See the [Advanced Hybrid RAG guide](../guides/advanced-rag). Lifecycle and machine-consumable commands support `--json`.

## See Also

- [Guides: Creating Servers](../guides/creating-servers)
- Source: `src/index.ts` (cmd* functions + printHelp)
