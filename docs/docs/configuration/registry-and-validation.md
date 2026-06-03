---
sidebar_label: Registry and Validation
sidebar_position: 3
---

# Registry and Validation

## ServerMetadata Shape (Zod)

See `ServerMetadataSchema` in `src/core/registry.ts`. Key fields:

- `slug`: `[a-z0-9-]{1,64}`
- `sourceUrl`: the exact URL used at create/reindex time
- `embeddingModel`: always `'fuse'` today
- `vectorIndexed`: always `false` today
- `authKey`: the `mcp_...` value (shown only at start)
- `chunkCount`: authoritative at registration time

## validateServerState

Used by `list`, `info`, `verify`:

- Tries to read metadata (corrupt → issue)
- Compares `getOnDiskChunkCount()` vs `meta.chunkCount`
- Common issues:
  - `chunks.json missing — RAG will return no results (run "hoolix reindex <slug>")`
  - `chunk count mismatch (registry claims X, disk has Y)`

## Why Validation Exists

Ingestion can partially fail, disks can be cleaned by users, reindex can be interrupted. The light validation surfaces broken state early without requiring a full RAG load or a running host.

## See Also

- [API: Core - Registry](../api-reference/core)
- [Guides: Reindexing and Verify](../guides/reindexing-and-verify)
- [FAQ: Drifted servers](../faq/common-issues)
