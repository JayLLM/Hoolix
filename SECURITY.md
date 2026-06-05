# Security Policy

Hoolix is local-first software that handles credentials, MCP tool access, gateway routing,
and agent approval policy. Please report security issues privately.

## Supported Versions

Hoolix is pre-1.0. Security fixes are prioritized for the latest published npm package and
latest GitHub release binaries. Older versions do not receive backported fixes.

## Security Boundaries

Before reporting, please read the [Threat Model](./THREAT_MODEL.md) to understand what
Hoolix considers in-scope and what is explicitly out of scope.

**In scope (Hoolix defends against these):**
- SSRF via malicious ingestion URLs (docs URLs that probe internal services)
- Unauthenticated access to hosted MCP servers or the web GUI
- Timing attacks on bearer token comparison
- Credential leakage to disk via child process stderr
- Shell injection via template run configs on Windows
- Tampered self-update binaries (SHA-256 verification required)
- Credential file world-readability (0600 + icacls on Windows)

**Out of scope (documented limitations):**
- Same-user process isolation (credentials are readable by any process under the same OS user)
- Hard filesystem / network sandbox (profile sandbox is best-effort; see Threat Model)
- `isWriteTool` completeness (regex heuristic; explicit rules required for high-risk tools)
- Log redaction completeness (known patterns only)
- Rate limiter precision under high concurrency

## Reporting a Vulnerability

Use GitHub private vulnerability reporting:

https://github.com/JayLLM/hoolix/security/advisories/new

Please include:

- Affected version or commit SHA.
- Operating system and install method (`npm`, standalone binary, `bun run dev`).
- Clear reproduction steps.
- Impact assessment, especially whether the issue involves:
  - Credential exfiltration (credentials.json, authKey, GUI token)
  - Remote code execution
  - SSRF or internal network access
  - Tool call policy bypass (profile sandbox, approval workflow)
  - Audit log tampering
  - Self-update supply chain
- Any logs or screenshots, **with all secrets removed**.

Do not open a public issue for a suspected vulnerability.

## Response Expectations

| Stage | Target |
|---|---|
| Acknowledge report | 3 business days |
| Initial severity assessment | 7 business days |
| Fix and coordinated disclosure | Based on severity (critical: 14 days; high: 30 days; medium/low: 90 days) |

## Severity Guidance

| Severity | Examples |
|---|---|
| Critical | RCE without user interaction, credential exfiltration from disk, supply chain tampering |
| High | SSRF to internal metadata services, auth bypass on hosted MCP endpoint, shell injection via template |
| Medium | GUI token in browser history, audit log manipulation, policy bypass requiring attacker-controlled tool name |
| Low | Rate limiter imprecision, sandbox heuristic gap without exploitation path |

## Known Limitations (Non-vulnerabilities)

The following items are documented design limitations and will not be treated as
vulnerabilities:

- Credentials readable by other processes under the same OS user (same-uid isolation)
- Profile sandbox does not prevent a malicious child process from bypassing it
- `isWriteTool` heuristic misses non-standard write-like tool names
- Log redaction does not cover all possible credential formats

See [THREAT_MODEL.md](./THREAT_MODEL.md) for the full list.
