---
sidebar_label: MCP Host
sidebar_position: 5
---

# MCP Host API Reference

Hoolix hosts each server over authenticated Streamable HTTP by default and can also produce stdio client configuration.

## HTTP HostOptions

```ts
export interface HostOptions {
  slug: string;
  port: number;
  dataDir: string;
  authKey: string;
  bindHost?: string;
}
```

## startHostedServer

```ts
export async function startHostedServer(opts: HostOptions): Promise<void>;
```

The host:

- Loads the RAG index for the slug.
- Creates the MCP server and documentation tools.
- Registers unauthenticated `/health`.
- Protects `/mcp` with per-server auth.
- Applies tool timeouts and response guards.
- Applies persistent rate limiting.
- Writes audit events and usage analytics.
- Serves Streamable HTTP through Hono.
- Writes runtime metadata for process management.

## Stdio Transport

```bash
hoolix start <slug> --transport stdio --json
```

Stdio mode is for clients that spawn a local command instead of connecting to an HTTP endpoint. The CLI prints a JSON configuration suitable for client setup or automation.

## Auth

HTTP MCP requests accept:

- `Authorization: Bearer <key>`
- `Authorization: bearer <key>`
- `X-MCP-Key: <key>`

`/health` is intentionally unauthenticated. MCP tool calls require auth.

Rotate keys with:

```bash
hoolix rotate <slug>
```

Restart running hosts and reconnect clients after rotation.

## Tools

Each server exposes:

| Tool | Description |
| --- | --- |
| `search_documentation` | Search indexed chunks with source URLs, optional mode, and token budgeting |
| `read_documentation_page` | Read a page or chunk by URL/title |
| `get_table_of_contents` | Return source-aware table of contents entries |

Search inputs may include token-aware limits such as `maxTokens` and `contextWindowTokens`.

## Rate Limit, Audit, And Stats

HTTP hosts enforce rate limits and persist state in the server data directory. Tool calls append audit entries and feed analytics:

```bash
hoolix audit <slug> --limit 20
hoolix stats <slug> --days 7
```

Audit events are useful for security review. Stats are useful for understanding what agents actually ask.

## Binary Host Model

Packaged binaries self-spawn the internal host so `hoolix start <slug>` works without source files, `tsx`, Node, or Bun. Development mode uses the source host path.

This invariant is critical for the install experience.

## See Also

- [Architecture: Host and Process](../architecture/host-and-process)
- [Authentication](../guides/authentication)
- [Connecting Clients](../guides/connecting-clients)
- [RAG and Tools](../architecture/rag-and-tools)
