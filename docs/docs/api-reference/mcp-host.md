---
sidebar_label: MCP Host
sidebar_position: 5
---

# MCP Host API Reference

## HostOptions

```ts
export interface HostOptions {
  slug: string;
  port: number;
  dataDir: string;
  authKey: string;
  bindHost?: string; // defaults to '127.0.0.1'
}
```

## startHostedServer

```ts
export async function startHostedServer(opts: HostOptions): Promise<void>;
```

- Loads RAG for the slug
- Creates `McpServer` + three tools (search / read / toc)
- Wraps each tool handler with `MCP_TOOL_TIMEOUT_MS` (default 15000ms) and returns actionable timeout/error text instead of letting clients hang
- Creates Hono app, registers unauthenticated `/health` first
- Registers auth middleware **only** on `/mcp`
- Connects `WebStandardStreamableHTTPServerTransport`
- Writes `.runtime.json`
- Serves via `@hono/node-server`
- Handles SIGTERM/SIGINT for cleanup

Exposed for both direct execution (dev) and the `__internal-host` packaged path.

## Direct Execution Guard

At module load time (bottom of `host.ts`):

```ts
if (
  process.argv.includes('--slug') &&
  process.argv.includes('--port') &&
  process.argv.includes('--data-dir') &&
  process.argv.includes('--auth-key')
) {
  parseArgs().then(startHostedServer)...;
}
```

This is the mechanism that makes the self-contained binary model work.

## Auth

Middleware accepts:
- `Authorization: Bearer <key>`
- `Authorization: bearer <key>`
- `X-MCP-Key: <key>`

Mismatch or missing → 401 JSON.

`/health` is deliberately outside the middleware.

Host logs mask auth keys. Full keys are emitted only by explicit connection-producing commands such as `start` and `connect`.

## Tools Exposed to Clients

See [RAG and MCP Tools](../architecture/rag-and-tools) for descriptions and input schemas.

## See Also

- [Architecture: Host & Process Model](../architecture/host-and-process)
- [Guides: Authentication](../guides/authentication)
- [Guides: Connecting Clients](../guides/connecting-clients)
- Source: `src/mcp/host.ts`
