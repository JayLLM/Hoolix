---
sidebar_label: CLI
sidebar_position: 1
---

# CLI Reference

Hoolix uses a hand-rolled CLI dispatcher. The default command opens the TUI, and machine-friendly commands support `--json`.

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
| `hoolix doctor [--json]` | Diagnose runtime, paths, config, registry, process manager, plugins, and proxy status |

## trial

```bash
hoolix trial [--json]
```

Creates a one-click public demo server. Use it for first-run testing, `npx` demos, or confirming client connection flow.

## create / install

```bash
hoolix create [name] [--url <url>] [--source <kind:value>] [--template <id>] [options]
hoolix install <template-id> [inputs…] [--name <name>] [--yes] [--json]
```

`create` creates a server from `--url`, `--source`, or `--template`. `install` is sugar for `create --template` that accepts positional inputs and prompts for credentials interactively.

### Common Options

| Option | Description |
| --- | --- |
| `--url <url>` | Backward-compatible single-source input |
| `--source <kind:value>` | Add one source; repeat for multi-source servers |
| `--template <id>` | Create from an official template |
| `--header "Name: Value"` | Add a private source request header |
| `--cookie "name=value"` | Add a private source cookie |
| `--hybrid` | Enable optional hybrid semantic + keyword indexing |
| `--embedding-model <model>` | Select an embedding model for hybrid RAG |
| `--schedule hourly\|daily\|off` | Store auto-reindex schedule metadata |
| `--credential <key=value>` | Set a credential inline (mcp-server templates) |
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
  --yes

# Template-backed servers
hoolix install filesystem /Users/you/projects --yes
hoolix install github-api --yes
hoolix install brave-search --yes
hoolix install postgres --credential databaseUrl=postgresql://localhost/mydb --yes
hoolix install memory --yes
```

## templates

```bash
hoolix templates list [--json]
hoolix templates info <id> [--json]
```

Lists and inspects official catalog templates (14 total). Templates are typed as `docs-rag` (ingests + indexes knowledge) or `mcp-server` (config-only, spawns via stdio or proxy).

## list / info

```bash
hoolix list [--json]
hoolix info <slug> [--json]
```

`list` shows registered servers with live status (including `proxy:PORT` for running proxy servers). `info` shows metadata, sources, template backing, chunk count, index mode, credentials, and reindex hints.

## verify

```bash
hoolix verify <slug> [--eval] [--json]
```

Checks server health: registry and chunk count consistency, source definitions, searchability, grounding URL coverage, and source provenance. Use `verify` before connecting a client and after major source changes.

## start / stop

```bash
hoolix start <slug> [--port <n>] [--transport http|stdio] [--proxy] [--json]
hoolix stop <slug> [--json]
```

`start` launches the MCP host.

| Flag | Description |
| --- | --- |
| `--transport http` | Authenticated Streamable HTTP (default for docs-rag) |
| `--transport stdio --json` | Print a stdio launch config |
| `--proxy` | Wrap a stdio mcp-server behind authenticated HTTP (auto-restart, health monitor) |

HTTP hosts include per-server auth, timeouts, persistent rate limiting, response guards, audit logging, and stats collection.

**Proxy mode** (`--proxy`) also supports SSE: when the client sends `Accept: text/event-stream`, the JSON-RPC response is wrapped as an SSE `data:` event.

## connect

```bash
hoolix connect <slug> [--client <target>] [--project] [--dry-run] [--yes] [--json] [--port <n>]
```

Writes or prints client configuration for the selected server.

Supported clients: `claude`, `claude-code`, `cursor`, `vscode`, `windsurf`, `continue`, `cline`, `grokbuild`, `generic`.

Supported clients get backup + merge behavior. Generic mode emits JSON only. Use `--dry-run` to preview without writing.

If `<slug>` is a gateway, `connect` automatically emits the gateway's single Streamable HTTP endpoint.

## gateway

```bash
hoolix gateway create <name> --include <server-slug> --include <server-slug> [--json]
hoolix gateway list [--json]
hoolix gateway start <name> [--port <n>] [--json]
hoolix gateway stop <name> [--json]
hoolix gateway connect <name> --client <target> [--project] [--dry-run] [--json]
hoolix gateway connect <name> --client <target> --profile <profile> [--json]
```

Creates and runs a unified local MCP gateway. A gateway aggregates configured `mcp-server` instances into one authenticated Streamable HTTP MCP endpoint.

```bash
hoolix gateway create my-tools --include github --include filesystem --include brave-search
hoolix gateway start my-tools
hoolix gateway connect my-tools --client codex
```

Gateway tools are namespaced as `<namespace>.<tool>`, such as `github.search_issues` or `filesystem.read_file`. Credentials remain on the backing servers; gateway config stores backend slugs, namespaces, and a separate gateway auth key.

Use `--profile <name>` to emit a profile-specific bearer token. The gateway uses that token as the client identity and enforces the profile policy before forwarding tool calls.

## profile

```bash
hoolix profile create <name> --include <namespace[,namespace]> [--approval writes|read-only|always-approve] [--gateway <name>] [--json]
hoolix profile list [--json]
hoolix profile edit <name> [--include ...] [--approval ...] [--rule <pattern=allow|deny|approve>] [--json]
hoolix profile delete <name> [--json]
```

Profiles define per-agent access to gateway tools. `--include github,filesystem` expands to `github.*` and `filesystem.*`. Approval modes are:

| Mode | Behavior |
| --- | --- |
| `writes` | Allows reads and queues likely write/mutation tools for approval |
| `read-only` | Denies likely write/mutation tools |
| `always-approve` | Queues every tool call for approval |

Sandbox flags:

| Flag | Description |
| --- | --- |
| `--fs-root <path>` | Allow filesystem/path-like arguments only inside this root |
| `--block-path <path>` | Deny filesystem/path-like arguments under this path |
| `--allow-domain <domain>` | Allow URL arguments only for this domain list |
| `--block-domain <domain>` | Deny URL arguments for this domain |

Rules are simple wildcard matches:

```bash
hoolix profile edit codex --rule "github.create_pull_request=approve"
hoolix profile edit claude --rule "filesystem.delete*=deny"
```

## approvals

```bash
hoolix approvals list [--all] [--json]
hoolix approvals approve <id> [--json]
hoolix approvals deny <id> [--json]
```

When a profile-scoped gateway tool call requires approval, the gateway queues it and returns a pending approval response. Approving the record allows the same profile/tool/arguments call on retry; denying it blocks that exact retry.

## clients

```bash
hoolix clients list [--json]
hoolix client status [--json]
```

`clients list` shows all supported MCP clients with detection status and config file paths. `client status` shows which Hoolix servers are wired into each detected client.

## secrets

```bash
hoolix secrets list <slug> [--json]
hoolix secrets set <slug> <key> [value] [--yes] [--json]
hoolix secrets remove <slug> <key> [--yes] [--json]
```

Manages credentials for `mcp-server` kind templates. Credentials are stored in a per-server `credentials.json` (mode 0600). Values are never logged or exported. If `value` is omitted from `secrets set`, the CLI prompts with a masked input.

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
| `--schedule hourly\|daily\|off` | Update schedule metadata |
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

Exports and imports single-server `.hoolix.json` bundles.

| Option | Description |
| --- | --- |
| `--team` | Prefer team-safe export defaults |
| `--strip-key` | Remove the server auth key from the bundle |
| `--include-key` | Include the server auth key for private backups |
| `--include-source-auth` | Include private source headers/cookies; use carefully |

## bundle

```bash
hoolix bundle export [slugs…] [--all] [--output <file>] [--team] [--json]
hoolix bundle import <file> [--yes] [--json]
```

Exports or imports multiple servers in a single `{ version: 1, type: 'multi-server-bundle' }` file. Credentials are **never** exported. After `bundle import`, the CLI prints `hoolix secrets set` instructions for each mcp-server that requires credentials.

## completion

```bash
hoolix completion bash
hoolix completion zsh
hoolix completion fish
hoolix completion powershell
```

Outputs a ready-to-source tab-completion script. The script dynamically resolves slugs (via `hoolix list --json`) and template IDs (via `hoolix templates list --json`) at tab-time.

Setup examples:
```bash
eval "$(hoolix completion bash)"          # bash: add to ~/.bashrc
eval "$(hoolix completion zsh)"           # zsh: add to ~/.zshrc
hoolix completion fish | source           # fish: add to config.fish
hoolix completion powershell | Invoke-Expression  # PowerShell: add to $PROFILE
```

## gui

```bash
hoolix gui [--port <n>]
```

Launches the token-protected local dashboard for visual management, templates, trial creation, stats, and the RAG playground.

## delete / update / uninstall

```bash
hoolix delete <slug> [--yes] [--json]
hoolix update [--no-verify] [--json]
hoolix uninstall [--yes] [--json]
```

`delete` removes one server. `update` downloads and applies the latest binary (SHA-256 verified; `--no-verify` skips). When installed via npm, `update` prints `npm update -g hoolix` instead. `uninstall` removes Hoolix data and the installed binary/PATH entries where supported.

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

- [Installation](../getting-started/installation)
- [Creating Servers](../guides/creating-servers)
- [Connecting Clients](../guides/connecting-clients)
- [Reindexing and Verify](../guides/reindexing-and-verify)
