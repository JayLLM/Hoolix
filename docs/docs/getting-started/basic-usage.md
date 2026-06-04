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
| `hoolix create "Name" --url <url>` | Create a single-source server |
| `hoolix create "Name" --source docs:<url> --source github:owner/repo` | Create a multi-source server |
| `hoolix templates list` | Browse official templates |
| `hoolix create "Name" --template <id>` | Create a template-backed server |
| `hoolix list` | Show registered servers |
| `hoolix info <slug>` | Show metadata, definition, sources, index, and runtime status |
| `hoolix verify <slug>` | Check retrieval and grounding quality |
| `hoolix start <slug>` | Start authenticated Streamable HTTP hosting |
| `hoolix start <slug> --transport stdio --json` | Print stdio MCP client config |
| `hoolix connect <slug> --client cursor` | Wire into an MCP client |
| `hoolix reindex <slug>` | Incrementally refresh source content |
| `hoolix stats <slug>` | Show usage analytics |
| `hoolix audit <slug>` | Inspect raw audit events |
| `hoolix export <slug> --team --strip-key` | Create a team-safe bundle |
| `hoolix import --file <bundle>` | Import a bundle |
| `hoolix gui` | Open the local dashboard |
| `hoolix doctor` | Diagnose setup, paths, runtime, and plugins |

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

## Create, Verify, Connect

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

## Sharing

```bash
hoolix export react-docs --team --strip-key --file react-docs.hoolix.json
hoolix import --file react-docs.hoolix.json --slug react-docs-copy --yes
```

Use `--include-key` only for private backups you control. Use `--include-source-auth` only when the destination is trusted to receive private source headers or cookies.

## See Also

- [CLI Reference](../api-reference/cli)
- [Creating Servers](../guides/creating-servers)
- [Reindexing and Verify](../guides/reindexing-and-verify)
- [Paths and Data](../configuration/paths-and-data)
