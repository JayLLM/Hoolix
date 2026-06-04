---
sidebar_label: Connecting Clients
sidebar_position: 4
---

# Connecting Clients

The shortest path is:

```bash
hoolix verify my-docs
hoolix start my-docs
hoolix connect my-docs --client cursor
```

`connect` can detect supported clients, merge Hoolix into existing config, create backups, copy snippets to the clipboard, and print client-specific restart steps.

## Streamable HTTP

Default hosting:

```bash
hoolix start my-docs
```

Example client config:

```json
{
  "mcpServers": {
    "my-docs": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:3456/mcp",
      "headers": {
        "Authorization": "Bearer mcp_..."
      }
    }
  }
}
```

Use HTTP when you want a local endpoint managed by Hoolix.

## Stdio

```bash
hoolix start my-docs --transport stdio --json
```

Use stdio for clients that spawn a local command. The JSON output is designed for direct client configuration or automation.

## Supported Clients

- Cursor
- Claude Desktop
- Windsurf
- Continue
- Cline
- Grok Build
- Generic MCP JSON

Use:

```bash
hoolix connect my-docs --client generic --json
```

when your client is not listed or you want to handle config yourself.

## Test Prompt

After reconnecting or restarting your client, ask:

```text
Use search_documentation for installation instructions and cite the source URL.
```

Good results should include relevant text and a URL from your indexed source.

## Common Gotchas

- Restart or reload the client after config changes.
- Make sure the port matches the running Hoolix host.
- Use the exact bearer key from `start`, `connect`, or `rotate`.
- Run `hoolix verify <slug>` before assuming the client is the issue.
- For stdio, use the `--json` output exactly as your client expects.

## See Also

- [Quick Start](../getting-started/quick-start)
- [Authentication](./authentication)
- [MCP Host Reference](../api-reference/mcp-host)
