---
sidebar_label: Registry and Validation
sidebar_position: 3
---

# Registry and Validation

Hoolix validates persisted state with Zod so old servers continue to work and broken state is surfaced early.

## Server Metadata

Key fields include:

- `slug`: stable lowercase identifier.
- `name`: display name.
- `sourceUrl`: backward-compatible primary source URL.
- `sourceType`: legacy/source summary.
- `definition`: optional server definition with sources, template backing, auth hints, and schedules.
- `embeddingModel`: `fuse` by default or a supported hybrid model.
- `vectorIndexed`: whether vector data exists.
- `authKey`: per-server `mcp_...` key.
- `chunkCount`: expected chunk count.
- `lastUpdatedAt`: latest create/reindex timestamp.

Legacy servers without `definition` are migrated in memory to a one-source definition.

## Validation

Used by `list`, `info`, `verify`, TUI, GUI, and services:

- Reads metadata and checks schema validity.
- Compares on-disk `chunks.json` count to metadata.
- Checks source definition shape.
- Surfaces missing chunks, count drift, stale source state, and migration issues.

Common fixes:

```bash
hoolix verify <slug>
hoolix reindex <slug> --yes
hoolix doctor
```

## Why Validation Exists

Servers can be interrupted mid-create, disks can be cleaned manually, source auth can expire, and old versions may lack newer definition fields. Validation lets Hoolix keep backward compatibility while showing users what to do next.

## See Also

- [Paths and Data](./paths-and-data)
- [Reindexing and Verify](../guides/reindexing-and-verify)
- [CLI Reference](../api-reference/cli)
