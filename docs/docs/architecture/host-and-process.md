---
sidebar_label: Host and Process Model
sidebar_position: 4
---

# Host and Process Model

The host model protects the binary install experience: `hoolix start <slug>` must work after installation with no source files or external runtime.

## Packaged Binary: Self-Spawn Model

When running from a compiled binary, Hoolix self-spawns for both host modes:

```text
hoolix start foo
  → hoolix __internal-host --slug foo --port N --data-dir ... --auth-key ...

hoolix start foo --proxy
  → hoolix __internal-proxy --slug foo --port N --data-dir ... --auth-key ...
    (which spawns the child stdio process internally)
```

The same executable re-enters the host or proxy path. Users do not need Node, Bun, `tsx`, or `node_modules`.

## Development

In development, the process manager uses the source through `tsx` or `bun run` so contributors can iterate without rebuilding a binary.

## ServerManager Responsibilities

`src/process/manager.ts` handles:

- Choosing a safe port.
- Writing an early runtime marker.
- Spawning the host cross-platform (no Unix signals — uses `ps-list` + `tree-kill`).
- Waiting for HTTP health when using HTTP transport.
- Stopping process trees safely on Windows and Unix.
- Reporting status to CLI, TUI, and GUI (`getStatus()` returns `mode: 'http' | 'proxy'`).

## HTTP Host (docs-rag)

The `src/mcp/host.ts` HTTP host:

- Loads the RAG store.
- Registers `search_documentation`, `read_documentation_page`, and `get_table_of_contents` tools.
- Serves public `/health`.
- Protects `/mcp` with bearer auth.
- Applies tool timeouts, response guards, persistent rate limiting, audit, and stats.
- Writes `.runtime.json` with `{ pid, port, startedAt, status, mode: 'http' }`.

## Proxy Host (mcp-server with --proxy)

The `src/mcp/proxy-host.ts` proxy host (`StdioJsonRpcProxy`):

- Spawns the child stdio MCP server process.
- Multiplexes JSON-RPC requests/responses over the child's stdin/stdout.
- Wraps JSON responses as SSE `data:` events when the client sends `Accept: text/event-stream`.
- Auto-restarts on unexpected child exit with exponential backoff: 1s, 2s, 4s, 8s, 16s — max 5 attempts. After max restarts, the proxy returns HTTP 503.
- Sends a fire-and-forget `ping` every 30 seconds to detect silent hangs.
- Rejects pending requests during restart to avoid silent hangs.
- Writes `.runtime.json` with `{ pid, port, startedAt, status, mode: 'proxy', childPid, template }`.

## Stdio

```bash
hoolix start <slug> --transport stdio --json
```

Stdio is exposed as client configuration rather than a long-running HTTP process. It is useful for clients that prefer local command transports.

## Runtime Files

`.runtime.json` is transient and disappears on clean stop. `rate-state.json`, `audit.log`, and stats files live in the server data directory.

Key `.runtime.json` fields:

```json
{
  "pid": 12345,
  "port": 3100,
  "startedAt": "2026-06-05T00:00:00.000Z",
  "status": "running",
  "mode": "http"
}
```

For proxy mode: `"mode": "proxy"` and `"childPid": 12346` are also present.

## See Also

- [MCP Host Reference](../api-reference/mcp-host)
- [Paths and Data](../configuration/paths-and-data)
- [Connecting Clients](../guides/connecting-clients)
