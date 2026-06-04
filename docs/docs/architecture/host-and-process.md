---
sidebar_label: Host and Process Model
sidebar_position: 4
---

# Host and Process Model

The host model protects the binary install experience: `hoolix start <slug>` must work after installation with no source files or external runtime.

## Packaged Binary

When running from a compiled binary, Hoolix self-spawns:

```text
hoolix start foo
  -> hoolix __internal-host --slug foo --port N --data-dir ... --auth-key ...
```

The same executable re-enters the host path. Users do not need Node, Bun, `tsx`, or `node_modules`.

## Development

In development, the process manager uses the source host through `tsx` or `node --import tsx` so contributors can iterate without rebuilding a binary.

## ServerManager Responsibilities

- Choose a safe port.
- Write an early runtime marker.
- Spawn the host cross-platform.
- Wait for HTTP health when using HTTP transport.
- Stop process trees with Windows-safe tooling.
- Report status to CLI, TUI, and GUI.

## HTTP Host

The HTTP host:

- Loads RAG.
- Registers MCP tools.
- Serves public `/health`.
- Protects `/mcp` with auth.
- Applies tool timeouts, response guards, persistent rate limiting, audit, and stats.
- Writes runtime metadata.

## Stdio

```bash
hoolix start <slug> --transport stdio --json
```

Stdio is exposed as client configuration rather than a long-running HTTP process. It is useful for clients that prefer local command transports.

## Runtime Files

`.runtime.json` is transient and should disappear on clean stop. `rate-state.json`, `audit.log`, and stats files live in the server data directory.

## See Also

- [MCP Host Reference](../api-reference/mcp-host)
- [Paths and Data](../configuration/paths-and-data)
- [Connecting Clients](../guides/connecting-clients)
