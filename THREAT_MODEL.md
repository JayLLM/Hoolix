# Hoolix Threat Model

## Overview

Hoolix is a local-first CLI tool. It runs on the developer's machine, manages credentials for external services, proxies tool calls to child MCP servers, and hosts authenticated HTTP MCP endpoints on loopback.

This document describes what Hoolix considers adversarial, what it explicitly does not protect against, and what the actual security boundaries are.

---

## Trust boundaries

### Trusted (same security context as Hoolix itself)

| Surface | Trust level | Notes |
|---|---|---|
| The OS user running `hoolix` | Full | All data is stored in the user's home directory. Hoolix makes no attempt to protect against a compromised or malicious user account. |
| Other processes under the same OS user | Full | Any process under the same user can read `~/.hoolix/` including credentials.json (mitigated by 0600 + icacls, but not a hard boundary). |
| Hoolix process itself | Full | Memory is not sandboxed. |

### Adversarial (Hoolix defends against these)

| Surface | Threat | Mitigation |
|---|---|---|
| **Docs URL / ingestion target** | SSRF: a malicious URL causes Hoolix to probe internal services (169.254.169.254, RFC1918, loopback) | `assertSafeFetchTarget()` in `src/lib/safeFetch.ts` — rejects private IPs before connection and blocks non-http/https schemes. Curl fallback is restricted with `--proto =https,http`. |
| **Docs URL / ingestion target** | Download of excessively large content | Per-source page limits (`maxPages`, `maxChunks`) and response size guards in the ingestion pipeline. |
| **MCP client connecting to a hosted server** | Unauthenticated access to server tools | Per-server bearer auth key (timing-safe compare) on `/mcp`. `/health` is unauthenticated but returns no sensitive data. |
| **MCP client connecting to a hosted server** | Flooding / resource exhaustion | In-memory fixed-window rate limiter (default 120 req/60s), `Retry-After` header on 429. |
| **Tool arguments passed to a gateway** | Extracting data outside allowed filesystem roots or blocked domains | Profile sandbox: filesystem root allow-list, blocked paths, allowed/blocked domains. Documented as defense-in-depth, not a hard isolation boundary (see limitations below). |
| **Template run config with malicious args** | Shell injection when spawning child MCP servers | Child processes are spawned with `shell: false` and explicit argv arrays. On Windows, `npx` is resolved via `cmd.exe /c npx.cmd` with array args (no shell string interpolation). |
| **Self-update binary download** | Tampered or corrupted binary | SHA-256 checksum verification is required (fail-closed on missing checksum file). `--no-verify` skips this and is not recommended. |
| **Audit / host logs** | Credentials printed to stderr by a child MCP server leak to disk | `redactSecrets()` applied to child stderr before writing to `host.log`. Common patterns (bearer tokens, GitHub tokens, API keys) are redacted. |
| **GUI token** | Token leaks via URL bar, browser history, Referrer header | Token is embedded server-side in a `<meta>` tag (never in the URL). JS sends it as `Authorization: Bearer`. `Cache-Control: no-store` on the dashboard response. |
| **GUI token file on disk** | World-readable token file | Written with 0600 permissions; existing files are chmod'd. On Windows, `icacls` removes inherited ACLs. |

---

## What Hoolix does NOT protect against

These are explicitly out of scope. Users relying on Hoolix in a shared or multi-user environment should layer additional controls.

### Same-user process isolation

Hoolix stores credentials in `~/.hoolix/servers/<slug>/credentials.json` with 0600 (or icacls-restricted) permissions. This prevents *other users* from reading credentials on POSIX systems, but does **not** prevent:
- Other processes running under the same OS user.
- Root / Administrator.
- Memory scrapers, debuggers, or process injection under the same user.

### Sandbox boundaries

Profile sandbox (`filesystemRoots`, `blockedPaths`, `allowedDomains`, `blockedDomains`) is a best-effort policy layer applied to tool-call arguments at the gateway level. It is **not** a hard OS-level sandbox. A malicious or buggy MCP server child can still:
- Access the filesystem directly (the sandbox only filters the arguments it sees).
- Make network connections that bypass domain checks.
- Use symlinks, relative paths, or encoded paths that aren't caught by the policy heuristic.

The sandbox exists to limit *accidental* over-reach and provide an approval workflow, not to contain a hostile process.

### Policy isWriteTool heuristic

`isWriteTool()` uses a regex on the tool name to detect write-like operations for the `writes` approval mode. This is a convenience heuristic. A tool named `upload_data` or `terraform_apply` will not be flagged. For high-risk surfaces, use explicit `policy.rules` entries rather than relying on `approvalMode: 'writes'`.

### Rate limiting under concurrency

The in-memory rate limiter is not atomic. Under high concurrency, the counter may be slightly over or under the configured limit. It is designed to prevent runaway loops, not to enforce billing-grade quotas.

### Log redaction completeness

`redactSecrets()` applies pattern-based redaction to known credential formats. Novel or obfuscated credential formats will not be caught. Treat `host.log` as potentially sensitive and restrict its permissions accordingly.

---

## Data flows and secrets

```
User                  Hoolix CLI             Child MCP Server        Remote source
 │                        │                        │                      │
 │  hoolix create         │                        │                      │
 │─────────────────────▶  │                        │                      │
 │                        │  fetch(url)            │                      │
 │                        │──────────────────────────────────────────────▶│
 │                        │◀──────────────────────────────────────────────│
 │                        │  writeJson(credentials.json, 0600)            │
 │                        │─────────────────────────────────────────────▶ │ (disk)
 │                        │                        │                      │
 │  hoolix start          │  spawn(cmd, args, {     │                      │
 │─────────────────────▶  │    shell:false })       │                      │
 │                        │────────────────────────▶│                      │
 │                        │                        │  MCP stdio           │
 │  MCP client            │  HTTP Bearer auth      │                      │
 │─────────────────────▶  │────────────────────────▶│                      │
 │                        │  (timing-safe compare)  │                      │
```

**Secrets that leave the process:**
- `authKey` — sent to the MCP client at `hoolix start` and `hoolix connect`. Stored in metadata.json (not credentials.json). Rotatable with `hoolix rotate`.
- Credentials (API tokens, connection strings) — stored in `credentials.json` (0600), interpolated into child process env at spawn time. Never written to audit.log or metadata.json.
- GUI token — stored in `.gui-token` (0600). Printed (masked) to terminal at `hoolix gui`. Embedded in the dashboard HTML once per page load.

---

## Reporting

See [SECURITY.md](./SECURITY.md) for the vulnerability disclosure process.
