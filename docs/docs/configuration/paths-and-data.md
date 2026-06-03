---
sidebar_label: Paths and Data
sidebar_position: 2
---

# Paths and Data Layout

All user data uses `env-paths` (cross-platform, respects OS conventions).

Typical locations:

- **Windows**: `%APPDATA%\hoolix\...`
- **macOS**: `~/Library/Application Support/hoolix/...`
- **Linux**: `~/.local/share/hoolix/...` (or `$XDG_DATA_HOME`)

Run `hoolix doctor` to see the exact resolved paths on your machine.

## Per-Server Layout

```
servers/
  <slug>/
    metadata.json          # ServerMetadata (Zod)
    .runtime.json          # transient (pid, port, startedAt) - deleted on clean stop
    data/
      chunks.json          # array of IngestedChunk (the RAG corpus)
```

## Registry

```
data/
  registry.json            # { version, servers: { slug: { slug, path } } }
  config.json              # rarely used today
```

## Why This Design?

- Survives binary upgrades (data is outside the exe).
- Multiple servers coexist cleanly.
- `delete` can just `fs.remove` the slug dir.
- Validation can stat `chunks.json` without loading RAG.

## See Also

- `src/core/paths.ts`
- [Doctor command](../getting-started/basic-usage)
- [Contributing: where tests write temp data](../contributing/testing)
