---
sidebar_label: Authentication
sidebar_position: 3
---

# Authentication

Hoolix has two auth stories:

- MCP host auth protects clients calling your server.
- Source auth lets Hoolix fetch private documentation during create and reindex.

## MCP Host Auth

Every server gets a unique key:

```ts
'mcp_' + randomBytes(24).toString('hex')
```

HTTP MCP requests can send:

```text
Authorization: Bearer mcp_...
X-MCP-Key: mcp_...
```

`GET /health` is public so process managers can check the host. `/mcp` requires auth.

## Key Visibility

Full keys are shown only by commands that intentionally produce connection payloads:

```bash
hoolix start <slug>
hoolix connect <slug> --json
hoolix rotate <slug>
```

Status surfaces such as `list`, `info`, TUI, GUI, and logs mask keys.

## Rotate Keys

```bash
hoolix rotate my-docs
hoolix stop my-docs
hoolix start my-docs
hoolix connect my-docs --client cursor
```

After rotation, update any client configs that used the old key.

## Source Auth

Use headers and cookies when the source requires credentials:

```bash
hoolix create "Private Docs" \
  --url https://docs.example.com/llms.txt \
  --header "Authorization: Bearer $DOCS_TOKEN" \
  --cookie "session=$DOCS_SESSION" \
  --yes
```

For private GitHub:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
hoolix create "Private Repo" --source github:org/private-repo --yes
```

Source auth is stored in the server definition so reindex can continue to work.

## Team Safety

Use team-safe exports when sharing bundles:

```bash
hoolix export my-docs --team --strip-key --file my-docs.hoolix.json
```

Only use `--include-key` for private backups. Only use `--include-source-auth` when the receiving team or machine is allowed to receive source credentials.

## Host Protections

HTTP hosts include:

- Per-server auth keys.
- Persistent rate limiting.
- Tool timeouts.
- Response guards.
- Append-only audit logs.
- Usage analytics.

## See Also

- [Connecting Clients](./connecting-clients)
- [Fetch and Protection Issues](../faq/fetch-and-protection)
- [MCP Host Reference](../api-reference/mcp-host)
