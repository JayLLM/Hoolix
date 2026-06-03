---
sidebar_label: Authentication
sidebar_position: 3
---

# Authentication

Every server gets a unique, cryptographically strong key at creation time:

```ts
'mcp_' + randomBytes(24).toString('hex')
```

The key is shown **only** in the output of `hoolix start` and in `info` while the server is running. It is stored in `metadata.json` but never printed by `list`.

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
- No key rotation UI today (delete + recreate to get a new one).
- The key is only in memory of the running host and in the registry file on disk (protect that directory with normal OS permissions).
- Never commit keys to git or share them in screenshots.

## See Also

- [Host implementation](../architecture/host-and-process)
- [Connecting Clients](./connecting-clients)
- Source: `src/mcp/host.ts` (auth middleware)
