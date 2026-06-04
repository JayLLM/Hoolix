---
sidebar_label: Basic Usage
sidebar_position: 3
---

# Basic Usage

Hoolix has three user surfaces:

- `hoolix` opens the TUI for daily work.
- `hoolix <command>` gives you scriptable CLI control.
- `hoolix gui` opens the local token-protected web dashboard.

## Everyday Commands

| Command | Description |
| --- | --- |
| `hoolix` | Open the TUI dashboard |
| `hoolix trial` | Create a first-run demo server |
| `hoolix install <template>` | Install an official MCP server template in one command |
| `hoolix templates list` | Browse official templates |
| `hoolix create "Name" --url <url>` | Create a single-source docs RAG server |
| `hoolix create "Name" --source docs:<url> --source github:owner/repo` | Create a multi-source server |
| `hoolix create "Name" --template <id>` | Create a template-backed server |
| `hoolix list` | Show registered servers with live proxy status |
| `hoolix info <slug>` | Show metadata, definition, sources, index, credentials, and runtime status |
| `hoolix verify <slug>` | Check retrieval and grounding quality |
| `hoolix start <slug>` | Start authenticated Streamable HTTP hosting |
| `hoolix start <slug> --proxy` | Wrap a stdio mcp-server behind authenticated HTTP |
| `hoolix start <slug> --transport stdio --json` | Print stdio MCP client config |
| `hoolix connect <slug> --client cursor` | Wire into an MCP client |
| `hoolix secrets set <slug> <key>` | Add or rotate a credential |
| `hoolix reindex <slug>` | Incrementally refresh source content |
| `hoolix stats <slug>` | Show usage analytics |
| `hoolix audit <slug>` | Inspect raw audit events |
| `hoolix export <slug> --team --strip-key` | Create a team-safe bundle |
| `hoolix import --file <bundle>` | Import a bundle |
| `hoolix bundle export <slugs…>` | Export multiple servers into one file |
| `hoolix bundle import <file>` | Import a multi-server bundle |
| `hoolix completion bash\|zsh\|fish\|powershell` | Generate shell tab-completion |
| `hoolix gui` | Open the local dashboard |
| `hoolix doctor` | Diagnose setup, paths, runtime, proxy status, and plugins |

## Common Flags

| Flag | Description |
| --- | --- |
| `--yes` | Skip confirmation prompts |
| `--json` | Emit machine-readable output |
| `--url <url>` | Create from one source |
| `--source <kind:value>` | Add one source; repeat for multi-source |
| `--template <id>` | Create from a catalog template |
| `--header "Name: Value"` | Add source auth header |
| `--cookie "name=value"` | Add source cookie |
| `--hybrid` | Enable optional hybrid semantic search |
| `--port <n>` | Choose a host or GUI port |
| `--proxy` | Wrap stdio server behind HTTP |
| `--no-verify` | Skip SHA-256 check on `hoolix update` |

## Install → Connect Flow

```bash
hoolix install filesystem /Users/you/projects --yes
hoolix connect filesystem --client cursor
```

```bash
hoolix install github-api --yes
hoolix start my-github --proxy   # expose over HTTP
```

## Create → Verify → Connect (Docs RAG)

```bash
hoolix create "React Docs" --url https://react.dev/llms.txt --yes
hoolix verify react-docs
hoolix start react-docs
hoolix connect react-docs --client cursor
```

## Reindexing

```bash
hoolix reindex react-docs --yes
hoolix reindex react-docs --schedule daily --yes
hoolix reindex --due --json
```

Reindex preserves the slug and auth key while refreshing chunks, source health, fingerprints, and index files.

## Sharing with Teammates

```bash
# Single server (credentials stripped)
hoolix export react-docs --team --strip-key --file react-docs.hoolix.json
hoolix import --file react-docs.hoolix.json --slug react-docs-copy --yes

# Multiple servers at once
hoolix bundle export my-docs my-github my-db --output team.hoolix.json --team
# Teammate runs:
hoolix bundle import team.hoolix.json --yes
# Then provides credentials printed in the output:
hoolix secrets set my-github githubToken ghp_...
```

## See Also

- [CLI Reference](../api-reference/cli)
- [Creating Servers](../guides/creating-servers)
- [Reindexing and Verify](../guides/reindexing-and-verify)
- [Paths and Data](../configuration/paths-and-data)
