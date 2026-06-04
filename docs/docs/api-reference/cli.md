---
sidebar_label: CLI
sidebar_position: 1
---

# CLI Reference

Hoolix uses a small hand-rolled CLI dispatcher. The default command opens the TUI, and machine-friendly commands support `--json`.

## Global

```bash
hoolix
hoolix --help
hoolix --version
hoolix doctor --json
```

| Command | Description |
| --- | --- |
| `hoolix` | Open the TUI dashboard |
| `hoolix --help` | Print command help |
| `hoolix --version` | Print the current version |
| `hoolix doctor [--json]` | Diagnose runtime, paths, config, registry, process manager, plugins, and source health |

## trial

```bash
hoolix trial [--json]
```

Creates a one-click public demo server. Use it for first-run testing, `npx` demos, or confirming client connection flow.

## create

```bash
hoolix create [name] [--url <url>] [--source <kind:value>] [--template <id>] [options]
```

Creates a server, ingests sources, builds the RAG index, writes metadata, and registers the server.

### Common Options

| Option | Description |
| --- | --- |
| `--url <url>` | Backward-compatible single-source input |
| `--source <kind:value>` | Add one source; repeat for multi-source servers |
| `--template <id>` | Create from an official template |
| `--header "Name: Value"` | Add a private source request header |
| `--cookie "name=value"` | Add a private source cookie |
| `--hybrid` | Enable optional hybrid semantic + keyword indexing |
| `--embedding-model <model>` | Select an embedding model supported by the hybrid RAG layer |
| `--schedule hourly|daily|off` | Store auto-reindex schedule metadata |
| `--yes` | Skip interactive confirmation |
| `--json` | Emit a machine-readable result |

Examples:

```bash
hoolix create "React Docs" --url https://react.dev/llms.txt --yes

hoolix create "Frontend Stack" \
  --source docs:https://react.dev/llms.txt \
  --source github:vercel/next.js \
  --yes

hoolix create "Private API" \
  --url https://docs.example.com/llms.txt \
  --header "Authorization: Bearer $DOCS_TOKEN" \
  --cookie "session=$DOCS_SESSION" \
  --yes

hoolix create "Terraform AWS" --template terraform-aws-docs --yes
```

## templates

```bash
hoolix templates list [--json]
hoolix templates info <id> [--json]
```

Lists and inspects official catalog templates. Templates are curated server definitions with source presets and optional inputs.

## list / info

```bash
hoolix list [--json]
hoolix info <slug> [--json]
```

`list` shows registered servers. `info` shows metadata, sources, template backing, chunk count, index mode, live status, masked auth status, validation warnings, and reindex hints.

## verify

```bash
hoolix verify <slug> [--eval] [--json]
```

Checks server health:

- Registry and chunk count consistency.
- Source definition and migration state.
- Searchability and sample searches.
- Grounding URL coverage.
- Source provenance.
- Optional hybrid evaluation and mode comparison.

Use `verify` before connecting a client and after major source changes.

## start / stop

```bash
hoolix start <slug> [--port <n>] [--transport http|stdio] [--json]
hoolix stop <slug> [--json]
```

`start` launches the MCP host.

- `--transport http` starts authenticated Streamable HTTP.
- `--transport stdio --json` prints a stdio launch config for clients that spawn local commands.

HTTP hosts include per-server auth, timeouts, persistent rate limiting, response guards, audit logging, and stats collection.

## connect

```bash
hoolix connect <slug> [--client claude|cursor|windsurf|continue|cline|grokbuild|generic] [--project] [--yes] [--json] [--port <n>]
```

Writes or prints client configuration for the selected server. Supported clients get backup + merge behavior. Generic mode emits JSON only.

## reindex

```bash
hoolix reindex <slug> [--yes] [--json] [--force] [--no-incremental] [--schedule hourly|daily|off]
hoolix reindex --due [--json]
```

Refreshes source content and rebuilds the index.

| Option | Description |
| --- | --- |
| `--force` | Re-fetch and rebuild even when fingerprints look unchanged |
| `--no-incremental` | Disable incremental skip behavior for this run |
| `--schedule hourly|daily|off` | Update schedule metadata |
| `--due` | Reindex every registered server whose schedule is due |

## stats / audit

```bash
hoolix stats <slug> [--days <n>] [--json]
hoolix audit <slug> [--limit <n>] [--tool <name>] [--since <prefix>] [--json]
```

`stats` summarizes query analytics, top queries, top pages, health, and activity. `audit` shows raw append-only host events for security review and troubleshooting.

## rotate

```bash
hoolix rotate <slug> [--yes] [--json]
```

Generates a fresh `mcp_` auth key. Restart running hosts and reconnect clients after rotation.

## export / import

```bash
hoolix export <slug> [--file <path>] [--team] [--strip-key] [--include-key] [--include-source-auth] [--json]
hoolix import --file <path> [--slug <slug>] [--yes] [--json]
```

Exports and imports `.hoolix.json` bundles.

| Option | Description |
| --- | --- |
| `--team` | Prefer team-safe export defaults |
| `--strip-key` | Remove the server auth key from the bundle |
| `--include-key` | Include the server auth key for private backups |
| `--include-source-auth` | Include private source headers/cookies; use carefully |

## gui

```bash
hoolix gui [--port <n>]
```

Launches the token-protected local dashboard for visual management, templates, trial creation, stats, and the RAG playground.

## delete / update / uninstall

```bash
hoolix delete <slug> [--yes] [--json]
hoolix update [--json]
hoolix uninstall [--yes] [--json]
```

`delete` removes one server. `update` updates compiled installs. `uninstall` removes Hoolix data and installed binary/PATH entries where supported.

## Source Syntax

| Syntax | Meaning |
| --- | --- |
| `docs:https://example.com/llms.txt` | Documentation URL |
| `llms:https://example.com/llms.txt` | Explicit llms source |
| `web:https://example.com/docs` | Regular web docs page |
| `github:owner/repo` | GitHub repository |
| `custom:<provider>:<value>` | Custom source plugin |

The old `--url <url>` syntax remains supported and maps to a single source definition internally.

## JSON Output

Use `--json` for automation. JSON modes avoid interactive prompts where possible; commands that could otherwise prompt usually require `--yes`.

## See Also

- [Creating Servers](../guides/creating-servers)
- [Connecting Clients](../guides/connecting-clients)
- [Reindexing and Verify](../guides/reindexing-and-verify)
