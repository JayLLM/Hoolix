---
sidebar_label: Connecting Clients
sidebar_position: 4
---

# Connecting Clients

The fastest way: after `create` + `verify`, run:

```bash
hoolix start my-docs
hoolix connect my-docs --client cursor     # or claude, windsurf, continue, cline, grokbuild
```

`connect` does:
- Computes the exact `streamable-http` + Bearer entry (uses live port if running, or prompts/suggests).
- Auto-detects popular clients.
- **Merges** into your existing client config (never clobbers other servers).
- Creates a timestamped `.bak` backup.
- Copies the snippet to clipboard.
- Prints client-specific steps + a ready-to-paste test prompt that exercises grounding.

Example output snippet (identical to what `start` shows):

```json
{
  "mcpServers": {
    "my-docs": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:3456/mcp",
      "headers": { "Authorization": "Bearer mcp_..." }
    }
  }
}
```

## Supported Clients (2026)

- **Cursor** — `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project with `--project`).
- **Claude Desktop** — global `claude_desktop_config.json` (mac/win/linux paths).
- **Windsurf** — `~/.codeium/windsurf/mcp_config.json`.
- **Continue.dev** — `.continue/mcpServers/mcp.json` (compat).
- **Cline** — `~/.cline/mcp.json`.
- **Grok Build / xAI** — same JSON shape.
- **Generic** — just prints + clipboard (for any other Streamable HTTP client or MCP Inspector).

## Local / non-client testing

```bash
node --import tsx test/verify-mcp.ts --slug my-docs
# or the curls printed by `start`
```

## Common Gotchas

- Always use the exact `Authorization: Bearer ...` header.
- After editing client config, fully restart/reload the client (Cursor "Reload Window", Claude full quit, etc.).
- Port must match what you started (connect helps here).
- hoolix is Streamable HTTP only (modern clients support it; older SSE-only need a proxy).

## See Also

- [Quick start](../getting-started/quick-start)
- [Authentication](./authentication)
- [verify + reindex](./reindexing-and-verify)
- Architecture: how the three tools work and why grounding URLs matter.
