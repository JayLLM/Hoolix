---
sidebar_label: Basic Usage
sidebar_position: 3
---

# Basic Usage

## Core Commands

| Command                  | Description |
|--------------------------|-------------|
| `hoolix create <name> --url <u>` | Ingest docs and register a new server |
| `hoolix list`        | Show all registered servers + quick drift warnings |
| `hoolix info <slug>` | Detailed metadata, runtime status, and validation |
| `hoolix start <slug>` | Spawn host (self-contained binary or dev) + print client config |
| `hoolix stop <slug>` | Stop a running server |
| `hoolix verify <slug>` | Exercise RAG (search/read/toc) and print samples + sources |
| `hoolix reindex <slug>` | Re-fetch from original `sourceUrl` and rebuild index |
| `hoolix export <slug> --file backup.hoolix.json` | Export metadata + chunks for backup or transfer |
| `hoolix import --file backup.hoolix.json --slug copy` | Import an exported server bundle |
| `hoolix delete <slug>` | Permanently remove server + data |
| `hoolix doctor`      | Installation, paths, registry, network, and runtime checks |
| `hoolix update`      | Self-update (compiled binaries only) |

Lifecycle and machine-readable commands support `--json` for scripting and CI.

## Common Flags

- `--yes`, `-y`: Skip interactive confirmations (great for scripts)
- `--port 1234`: Override the port chosen by `start`
- `--url https://...`: Non-interactive create

## Reindexing

When the upstream documentation changes:

```bash
hoolix reindex xai-docs --yes
```

Reindex re-runs the full ingestion pipeline from the stored `sourceUrl`, rebuilds the local Fuse index, and updates registry metadata. The auth key is preserved.

## Deleting Servers

```bash
hoolix delete my-old-docs
```

Data directories, chunks, metadata, and runtime markers are removed. Running instances are not auto-stopped (stop first if needed).

## See Also

- [Guides: Reindexing and Verify](../guides/reindexing-and-verify)
- [Configuration](../configuration/paths-and-data)
- [CLI API Reference](../api-reference/cli)
