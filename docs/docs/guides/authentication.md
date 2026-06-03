---
sidebar_label: Authentication
sidebar_position: 3
---

# Authentication

Every server gets a unique, cryptographically strong key at creation time:

```ts
'mcp_' + randomBytes(24).toString('hex')
```

The full key is shown only when a command needs to produce a usable connection payload, such as `hoolix start`, `hoolix connect --json`, or the new-key output from `hoolix rotate`. Status-style surfaces such as `list`, `info --json`, host logs, and Web GUI list/info responses mask auth keys.

## How Clients Send It

Two supported headers (case-insensitive for Bearer):

```
Authorization: Bearer mcp_0123456789abcdef...
X-MCP-Key: mcp_0123456789abcdef...
```

The MCP host middleware checks before the Streamable HTTP transport sees the request.

## Health Check Is Public

`GET /health` requires no auth. This lets process managers and `doctor`-style checks work without leaking keys.

## Security Model

- Keys are per-server (not global).
- Rotate keys with `hoolix rotate <slug> --yes` and then restart the server.
- The key is only in memory of the running host and in the registry file on disk (protect that directory with normal OS permissions).
- MCP tool handlers use timeout wrappers (`MCP_TOOL_TIMEOUT_MS`, default 15000ms), response caps, rate limiting, and append-only audit logging.
- Never commit keys to git or share them in screenshots.

## See Also

- [Host implementation](../architecture/host-and-process)
- [Connecting Clients](./connecting-clients)
- Source: `src/mcp/host.ts` (auth middleware)
