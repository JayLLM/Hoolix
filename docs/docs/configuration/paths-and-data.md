---
sidebar_label: Paths and Data
sidebar_position: 2
---

# Paths and Data Layout

Hoolix uses OS-native data directories via `env-paths`.

Typical locations:

- **Windows**: `%APPDATA%\hoolix\...`
- **macOS**: `~/Library/Application Support/hoolix/...`
- **Linux**: `~/.local/share/hoolix/...` or `$XDG_DATA_HOME`

Run:

```bash
hoolix doctor
```

to see exact paths on your machine.

## Override Data Directory

```bash
MCP_PORTAL_DATA_DIR=/tmp/hoolix-demo hoolix list
```

This is useful for tests, demos, and isolated automation.

## Per-Server Layout

```text
servers/
  <slug>/
    metadata.json
    audit.log
    rate-state.json
    .runtime.json
    data/
      chunks.json
      embeddings.json
```

Some files appear only when relevant. For example, `embeddings.json` exists for hybrid servers, `.runtime.json` exists while running, and `rate-state.json` is written by HTTP hosts.

## Global Data

```text
data/
  registry.json
  config.json
source-plugins/
  *.json
```

Custom source plugin manifests can also live in `HOOLIX_SOURCE_PLUGIN_DIR`.

## Bundles

Exports are `.hoolix.json` files:

```bash
hoolix export my-docs --team --strip-key --file my-docs.hoolix.json
```

Bundles contain metadata, definitions, chunks, and optional embeddings. Auth keys and source auth are controlled by export flags.

## See Also

- [Environment](./environment)
- [Registry and Validation](./registry-and-validation)
- [CLI Reference](../api-reference/cli)
