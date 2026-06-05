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

- **Per-server auth keys** — 96-bit cryptographically random, `mcp_`-prefixed bearer tokens generated with `crypto.randomBytes`.
- **Timing-safe comparison** — bearer token validation uses `crypto.timingSafeEqual` to prevent timing-based token extraction.
- **In-memory rate limiting** — fixed-window counter with periodic disk persistence (no per-request file I/O).
- **Tool timeouts** — per-tool execution limits (`MCP_TOOL_TIMEOUT_MS`, default 15 s).
- **Atomic append-only audit logs** — rotation via write-to-tmp then atomic rename; in-memory line counter.
- **Log redaction** — child-process stderr is scrubbed of `mcp_`, `ghp_`, `sk-`, `Authorization:`, and `KEY=value` patterns before writing to `host.log`.
- **Security headers** — all GUI routes emit `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Cache-Control: no-store`.

## GUI Token Security

The dashboard bearer token is embedded server-side in a `<meta name="hoolix-token">` tag. The browser JS reads it from the DOM and sends `Authorization: Bearer <token>` on every API request. The token never appears in the URL, browser history, server access logs, or `Referer` headers.

Opening the GUI (`hoolix gui`) launches the browser without a `?token=` query parameter.

## Credential File Permissions

`credentials.json` is stored with `chmod 0600` on Unix. On Windows, inherited ACLs are removed via `icacls` so only the owning user can read the file.

## See Also

- [Connecting Clients](./connecting-clients)
- [Fetch and Protection Issues](../faq/fetch-and-protection)
- [MCP Host Reference](../api-reference/mcp-host)
