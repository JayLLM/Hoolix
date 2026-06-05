# Changelog

All notable changes to **Hoolix** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Fix's release error

## [0.0.6] - 2026-06-05

### Security — Phase 2 test coverage & supply chain (v0.0.5 polish sprint)

#### Security test suite (8 new test files, 156 new assertions)
- **`test/security-auth.test.ts`** — `timingSafeEqualString` correct/incorrect/length-mismatch/unicode; `generateAuthKey` prefix/length/uniqueness/hex-charset.
- **`test/security-ssrf.test.ts`** — `isPrivateIp` exhaustive IP matrix (RFC1918, loopback, link-local, CGN, IPv6); `assertSafeFetchTarget` scheme/hostname/bare-private-IP/DNS-resolution/trailing-dot/invalid-URL cases. DNS mocked via `vi.mock` so no network required.
- **`test/security-policy.test.ts`** — `evaluatePolicy` full matrix: null profile, gateway allow/deny, tool wildcard allow/deny, sandbox path/domain block, policy rules, `approvalMode` (always/read-only/writes), default effect. Also tests `matchesPattern` and `isWriteTool`.
- **`test/security-interpolate.test.ts`** — `interpolateString` single/multi/unknown/empty/shell-metachar/backtick substitution; `interpolateRunConfig` args/env/command-not-interpolated/unknown-key/empty-map.
- **`test/security-redact.test.ts`** — `redactSecrets` for `mcp_`, `ghp_`, `github_pat_`, `sk-`, `Authorization:`, `Bearer`, `KEY=value`, multi-secret lines, empty string.
- **`test/security-updater.test.ts`** — `compareVersions` semver matrix (major/minor/patch/prerelease/v-prefix); `verifyChecksum` fail-closed: no URL → `{ok:false,verified:false}`; 404 → fail-closed; asset missing from file → fail-closed; good hash → `{ok:true,verified:true}`; bad hash → `{ok:false,verified:true}`; network error → fail-closed.
- **`test/security-audit.test.ts`** — `AuditLogger` creates file, valid JSON per entry, append count, init loads prior lines, rotation (line threshold, keeps keepRatio, no tmp file left); `RateLimiter` within-limit/exceeds/window-reset/retryAfterSeconds/flush-to-disk/start-fresh/stop-clean.
- **`test/security-registry.test.ts`** — `registerServer` always sets schemaVersion; schema migration backfills schemaVersion on legacy records; migrated value is persisted on first read; no re-write on second read after migration.

#### Source exports for testability
- `src/core/updater.ts` — `compareVersions` and `verifyChecksum` exported (`@internal`) for direct unit testing.

#### Supply chain
- `.github/workflows/scorecard.yml` — OSSF Scorecard analysis on push to `main` and weekly schedule; results uploaded to the GitHub Security tab.
- `release.yml` — CycloneDX SBOM (`hoolix-sbom.cdx.json`) generated via `@cyclonedx/cyclonedx-npm` and attached to every GitHub Release alongside `SHA256SUMS` and GPG signatures.

---

## [0.0.5] - 2026-06-05

feat: enhance dashboard security by embedding token in meta tag

- Updated buildDashboardHtml to embed the token in a <meta> tag instead of passing it via URL.
- Adjusted JavaScript to read the token from the <meta> tag for API calls.
- Improved security by ensuring the token is not exposed in browser history or logs.

fix: improve GUI token handling and permissions

- Added checks to ensure GUI token file permissions are set to 0600.
- Implemented Windows-specific ACL tightening for the GUI token file.
- Enhanced error handling for token management.

chore: add CodeQL analysis and dependency review workflows

- Introduced GitHub Actions workflows for CodeQL analysis and dependency review.
- Scheduled weekly scans for vulnerabilities and dependency updates.

docs: create threat model documentation

- Added THREAT_MODEL.md to outline security boundaries and adversarial threats.
- Documented trust boundaries and what Hoolix does not protect against.

feat: implement audit logging and log redaction

- Created an append-only audit logger with in-memory line counting and atomic rotation.
- Added log redaction functionality to prevent sensitive information from being logged.

feat: implement in-memory rate limiting and SSRF protection

- Developed an in-memory fixed-window rate limiter with periodic state persistence.
- Added SSRF-safe fetch helpers to validate outbound HTTP requests.

## [0.0.4] - 2026-06-05

### Added

- **Unified local MCP control plane** — added the `hoolix gateway` command family to create, list, start, stop, and connect one authenticated Streamable HTTP gateway that aggregates multiple configured `mcp-server` backends behind a single endpoint.
- **Namespaced gateway tools** — gateway tool discovery now rewrites backing server tools as `<namespace>.<tool>` (for example `github.search_issues`, `filesystem.read_file`, `memory.create_entities`) and forwards calls to the correct stdio MCP server.
- **Client profiles** — added `hoolix profile create|list|edit|delete` for per-agent identities with profile-specific bearer tokens, allowed gateway/tool patterns, approval modes, policy rules, and basic sandbox boundaries.
- **Human approval queue** — added `hoolix approvals list|approve|deny`; profile-scoped gateway calls that require approval are queued, return a pending approval response, and execute on retry after approval.
- **Basic gateway policy engine** — gateway calls are evaluated before forwarding with wildcard rules (`allow`, `deny`, `approve`), write-operation defaults, filesystem path boundaries, and network domain allow/block lists.
- **Gateway/profile-aware TUI** — the terminal dashboard now shows servers, gateways, profiles, pending approvals, gateway backend details, and quick approval actions (`a` approve, `A` deny).

### Changed

- **`hoolix gateway connect`** now accepts `--profile <name>` and emits a profile-scoped HTTP config for Codex, Claude Code, Cursor, Grok Build, and other MCP-compatible clients.
- **`hoolix list` and `hoolix doctor`** now report gateway, profile, and pending approval state alongside existing server/proxy health.
- **Web GUI control-plane view** — the local GUI now exposes gateway, profile, and pending approval state through a Control Plane panel and `/api/control-plane`.
- **Shell completions and help text** now include gateway, profile, approval, and profile-aware connect workflows.
- **AGENTS.md and docs** now describe gateway/profile/approval invariants, storage locations, and control-plane architecture.

### Fixed

- **Windows npm shim startup** — `bin/hoolix.js` now converts the compiled `dist/index.js` path with `pathToFileURL()` before `await import()`, fixing `ERR_UNSUPPORTED_ESM_URL_SCHEME` for global npm installs on Windows while preserving same-process startup and signal handling.
- **Windows `npx` stdio spawning** — proxy and gateway child processes now launch `npx.cmd` through the Windows shell to avoid `spawn EINVAL` on recent Node builds.

## [0.0.2] - 2026-06-05

### Added

- **`hoolix gateway` MVP** — create, list, start, stop, and connect a unified local MCP gateway that aggregates configured `mcp-server` instances behind one authenticated Streamable HTTP endpoint with namespaced tools.
- **Gateway-aware TUI** — the terminal dashboard now shows servers and gateways in one left panel, gateway details/backends on the right, and gateway-aware `g`, `s`, and `c` actions.
- **Client profiles and approval queue** — `hoolix profile` creates per-agent gateway identities with allowed tools, approval modes, policy rules, and sandbox boundaries; `hoolix approvals` reviews and decides pending gateway tool calls.

### Fixed

- **Windows `npx` proxy spawning** — stdio proxy/gateway child launch now handles `npx.cmd` through the Windows shell to avoid `spawn EINVAL` on recent Node builds.

## [0.0.1] - 2026-06-04

### Added

- **`fetch` template** (`mcp-server-fetch` via uvx) — zero-credential web browsing / URL fetching for AI agents. Brings official template count to 15.
- **`hoolix verify` — package reachability check for mcp-server kind** — runs `npm view <package> version` (no download) to confirm the npm package exists on the registry. For uvx templates runs a probe via `uvx`. Failure now returns a clear actionable message instead of passing silently.
- **First-run download warnings in `hoolix install` and `hoolix templates info`** — when a template uses `npx`, a note is printed: "first use downloads the package from npm (5–30 s)". Puppeteer gets an explicit Chromium size warning (~170 MB).
- **VS Code project-level guidance in `hoolix connect`** — when `--client vscode` is used without `--project`, instead of a generic "no auto-write path" message, Hoolix now prints the exact command to run (`hoolix connect <slug> --client vscode --project`) with an explanation of the `.vscode/mcp.json` workflow.

### Changed

- README tagline updated: "Install, host, and share every MCP server — in one command." / "Your MCP home base. Zero config for the official servers."
- `hoolix verify` missing-credential detail now includes the fix command (`hoolix secrets set <slug> <key>`).

## [0.0.1-beta.20] - 2026-06-04

### Fixed

Documentation update.

## [0.0.1-beta.19] - 2026-06-04

### Fixed

Workflow removes macos13 due to github runners no longer working.

## [0.0.1-beta.18] - 2026-06-04

### Fixed

- **`release.yml` — `id-token: write` scoped to `publish-npm` job only** — previously granted at workflow level, giving every job (including binary builds on third-party matrix runners) unnecessary OIDC credentials. Now confined to the `publish-npm` job via per-job `permissions:`.
- **`release.yml` — GPG secret detection** — `if: ${{ secrets.GPG_PRIVATE_KEY != '' }}` never evaluated `true` because GitHub Actions masks secrets in all expressions. Replaced with an env-var probe step that outputs `available=true/false` via `$GITHUB_OUTPUT`, which downstream steps reference as `if: steps.gpg-check.outputs.available == 'true'`.
- **`bin/postinstall.js` — cross-platform portability** — `"postinstall": "node bin/postinstall.js 2>/dev/null || true"` used a bash-only stderr redirect that `cmd.exe` (Windows npm) would interpret as an argument. Script now always exits 0 via `process.on('uncaughtException', () => process.exit(0))`, so the redirect is unnecessary. Added dev-checkout detection (skips welcome output when `src/index.ts` is present next to the script, i.e. developer running `npm install` in the repo).

### Added

- **Beta npm releases published as `--tag next`** — beta/prerelease versions (any version containing a `-`) are now published to npm with `--tag next` instead of being skipped entirely. Stable releases continue to use `--tag latest`. This allows `npm install -g hoolix@next` for beta testing.
- **macOS x64 binary** (`hoolix-darwin-x64`) — `macos-13` runner added to the `build-binaries` matrix. Provides a native binary for Intel Macs instead of relying on Rosetta.
- **`is_prerelease` output** from `prepare-release` job — detects any prerelease pattern (beta, alpha, rc, etc.) via regex rather than checking only the `beta` input value. Used for both the npm dist-tag decision and the GitHub Release `prerelease:` flag.

## [0.0.1-beta.17] - 2026-06-04

### Added

- **npm global package** (`npm install -g hoolix`) — v1.0.0 is the first stable release published to npm. The bin shim now uses dynamic `import()` in the same process (no subprocess overhead, correct signal handling for TUI Ctrl+C, faster startup). Includes `STABILITY.md` and `postinstall.js` welcome message. npm publishes with [provenance](https://docs.npmjs.com/generating-provenance-statements) via GitHub Actions (`id-token: write`).
- **Free binary signing** — GitHub Releases now attach a `SHA256SUMS` file for all platform binaries. GPG `.asc` detached signatures are generated when the `GPG_PRIVATE_KEY` repository secret is set (optional; non-blocking). Both the `install.sh` and `install.ps1` scripts verify SHA-256 checksums automatically.
- **Updater SHA-256 verification** (`hoolix update`) — after downloading the new binary, the updater fetches `SHA256SUMS` from the GitHub Release and verifies the hash before applying the update. A mismatch aborts the update with a clear error. Pass `--no-verify` to skip. Auto-update now also detects npm global installs and advises `npm update -g hoolix` instead of binary self-replace.
- **Windows `install.ps1` SHA-256 verification** — checksum verification added to the Windows PowerShell installer. npm recommendation added to the banner.
- **`hoolix doctor` install-method detection** — reports `npm global install (provenance-verified)` vs `standalone binary (verify via SHA256SUMS)` vs `development/source`. Shows appropriate update command at the bottom (`npm update -g hoolix` vs `hoolix update`).
- **`hoolix update --no-verify`** — skip SHA-256 checksum verification when downloading a binary update (for air-gapped or testing scenarios).
- **`install.sh` SHA-256 verification** — checksum verification added to the Linux/macOS bash installer. `npm install -g hoolix` recommended at the top.
- **npm release job** in `release.yml` — new `publish-npm` job runs `bun run build` → `npm publish --access public --provenance` on non-beta releases. Gated on `NPM_TOKEN` secret.
- **`STABILITY.md`** — versioning policy, stable CLI surface, stable `--json` schema, on-disk file format stability, and LTS policy (security fixes for 24 months after v1.0).

### Changed

- `bin/hoolix.js` — production path now uses `await import(distEntry)` in the same process instead of `spawnSync`. Dev fallback still uses tsx spawnSync.
- `package.json` — version bumped to `1.0.0`; added `"exports": { ".": "./dist/index.js" }`; added `postinstall` script; added `STABILITY.md` to `"files"`. Description updated.
- `hoolix update` — detects npm vs binary install and gives the right update command.
- `release.yml` — `attach-binaries` job renamed to `attach-release-assets`; new `publish-npm` job added; release notes body now includes verification instructions and install commands.

### Added (pre-v1.0 accumulated, earlier betas)

- **Shell completions** (`hoolix completion bash|zsh|fish|powershell`) — tab-complete commands, slugs, template IDs, client names.
- **Multi-server bundle** (`hoolix bundle export|import`) — export/import multiple servers; credentials never exported.
- **14 official templates** — filesystem, github-api, postgres, sqlite, memory, sequential-thinking, brave-search, slack, puppeteer, google-maps, docs-rag, github-docs, hoolix-docs, terraform-aws-docs.
- **Proxy mode** (`hoolix start <slug> --proxy`) — auto-restart, health monitoring, SSE phase 1.
- **`hoolix list` proxy status** — `proxy:PORT` in Status column.
- **Community templates** — `~/.hoolix/templates/*.json`.
- **`hoolix secrets *`** — credential CRUD for mcp-server kind.
- **`hoolix connect`** — 9 supported clients (claude, claude-code, cursor, vscode, windsurf, continue, cline, codex, grokbuild, generic).
- **`hoolix export / import`** — single-server bundle round-trip with credential notes.
- **TUI** — kind-aware detail panel, proxy status, `s/c/x/v` key handlers.
- **`hoolix install <template> [positionals]`** — sugar for create --template.

### Added

- **Shell completions** (`hoolix completion bash|zsh|fish|powershell`) — generates ready-to-source tab-completion scripts. Dynamic slug and template ID completion via `hoolix list --json` and `hoolix templates list --json`. Update check suppressed during completion output.
- **Multi-server bundle** (`hoolix bundle export|import`) — export multiple servers into a single `.hoolix.json` bundle; import restores all servers with fresh auth keys and prints `hoolix secrets set` instructions for mcp-server credentials. Format: `version: 1, type: 'multi-server-bundle'`. Credentials are never exported (same invariant as single-server export).
- **6 new official templates** (total now 11): `sequential-thinking`, `brave-search`, `slack`, `puppeteer`, `google-maps` (all npm-based mcp-server kind), each with credential definitions, tags, and `proxyable: true`. Brings the official catalog from 5 to 11 templates.
- **`hoolix list` proxy status** — Status column now shows `proxy:PORT` for mcp-server kind servers running in proxy mode (concurrent status checks; zero change for docs-rag servers).
- **`hoolix doctor` proxy-mode check** — reports which servers are currently running in proxy mode; always passes (informational).
- **Proxy auto-restart** — `StdioJsonRpcProxy` automatically restarts the child process on unexpected exit with exponential backoff (1s → 2s → 4s → 8s → 16s, max 5 attempts). After max restarts, proxy marks itself degraded and returns HTTP 503.
- **Proxy health monitoring** — 30-second fire-and-forget `ping` to detect silent child hangs; failures are expected for servers that don't implement ping and are silently ignored.
- **Proxy SSE support (phase 1)** — when a client sends `Accept: text/event-stream`, the synchronous JSON-RPC response is wrapped as an SSE `data:` event and streamed with correct headers. Enables compatibility with SSE-expecting MCP clients without full bidirectional streaming.
- **TUI proxy detail panel** — mcp-server kind detail shows `running (proxy on :PORT)` + Proxy URL when in proxy mode; `s` key stops the proxy; `c` copies HTTP config when proxied.
- **TUI empty-state guidance** updated to lead with `hoolix install` commands (filesystem, github-api, brave-search) rather than generic create.
- **`STABILITY.md`** — documents versioning promises (semver), stable CLI surface, stable JSON schema, stable on-disk file formats, and upgrade policy for v1.0.

### Changed

- `hoolix list` — replaced `Chunks` column header with `Status` for mcp-server kind rows (shows `proxy:PORT`, `running`, or `stdio`).
- `hoolix doctor` — added `proxy-mode` informational check after `uvx` check.
- `hoolix start` (mcp-server, no proxy) — hint message now shows `proxy:PORT` info in bold when similar servers exist in proxy mode.

## [0.0.1-beta.16] - 2026-06-04

### Added

- **Proxy mode** (`hoolix start <slug> --proxy`) — wraps any `mcp-server` kind server behind an authenticated Hono HTTP endpoint, using the same auth, rate-limiting, and audit middleware as the docs-rag host. Enables sharing the same underlying server across multiple AI clients and remote access.
  - New `src/mcp/proxy-host.ts`: spawns the child stdio MCP server process, bridges synchronous JSON-RPC request/response over HTTP (batch + notifications supported). Writes `.runtime.json` with `mode: 'proxy'`.
  - `ServerStatus.mode` — new field (`'http' | 'proxy'`) surfaced by `ServerManager.getStatus()` from the runtime file.
  - `ServerManager.startProxied(slug, opts)` — new method following the same `buildProxySpawnPlan` + health-probe pattern as `start()`.
  - `__internal-proxy` binary dispatch — follows the `__internal-host` model for self-contained binary execution.
  - `hoolix connect <slug>` — automatically prefers HTTP config when the server is running in proxy mode.
  - `hoolix info <slug>` — shows "running (proxy on :PORT)" status and "Proxy URL" field when proxied; updated "Next" section with proxy-aware commands.
  - `hoolix start <slug>` without `--proxy` now also mentions proxy as an option in the stdio redirect message.

## [0.0.1-beta.15] - 2026-06-04

### Added

- **`hoolix install` positional syntax** — `hoolix install <template-id> [positional-values...] [--name <name>] [--yes]`. Positional arguments are mapped to the template's required inputs in definition order (e.g. `hoolix install filesystem /Users/jay/projects --yes` maps `/Users/jay/projects` to `allowedPath`). Falls back to interactive prompts for any missing required inputs. Existing `--input key=value` flags take precedence over positionals. `--name <name>` sets the server name without an interactive prompt.
- **`hoolix export` credential note** — for `mcp-server` kind servers, the exported bundle now includes a top-level `credentialsNote` object listing the required credential keys and setup instructions. The human-readable output prints exact `hoolix secrets set` commands to run after importing.
- **`hoolix import` credential instructions** — after importing a bundle for an `mcp-server` kind server, the CLI prints exact `hoolix secrets set <slug> <key>` commands for each required credential. JSON output includes `credentialsRequired: true`, `missingCredentials: [...]`, and a `next` array with the commands.

## [0.0.1-beta.14] - 2026-06-04

### Added

- **Community template loader** (`src/catalog/community.ts`) — reads and validates `*.json` files from `~/.hoolix/templates/` (or `HOOLIX_TEMPLATE_DIR` env var override) against `CatalogTemplateSchema`. Invalid files emit `logger.warn` and are skipped; they never crash the CLI. Follows the exact `source-plugins.ts` pattern.
- `listTemplates()` in `src/app/services/catalog.ts` now merges official + community templates; `getTemplate()` transparently resolves community templates by ID.
- **`hoolix templates list --community`** — filter flag showing only community templates; if the directory is empty, shows the path to add templates to.
- **`hoolix doctor` `community-templates` check** — reports how many templates are in `~/.hoolix/templates/` and prints the directory path for discoverability.
- **TUI kind-aware detail panel** — for `mcp-server` kind servers the right panel now shows Kind, Template, Transport (`stdio`), and credential count instead of chunk count, index type, and freshness.
- **TUI kind-aware key handlers**:
  - `s` on mcp-server kind: prints "uses stdio transport — press c to copy config" instead of attempting HTTP host start.
  - `v` on mcp-server kind: shows credential count and suggests `hoolix verify` instead of running RAG verify.
  - `c` on mcp-server kind: builds `{ command, args, env }` stdio config by loading credentials + interpolating run config, then copies to clipboard.
  - `x` on mcp-server kind: shows `hoolix secrets set <slug> <key> <value>` hint instead of triggering reindex.
- Key help bar updated: `x reindex/secrets` replaces `x reindex`; empty-state guidance updated to include mcp-server template examples.

## [0.0.1-beta.13] - 2026-06-04

### Added

- **`hoolix secrets` command family** — credential rotation for `mcp-server` kind servers without deleting/recreating them. Three sub-commands: `secrets list <slug>` (shows masked keys with template labels and env-var hints), `secrets set <slug> <key> [value]` (adds or replaces a credential; prompts with masked input if value omitted; supports `--value`, `--yes`, `--json`), `secrets remove <slug> <key>` (deletes a key with confirmation; warns if removing a required credential). Both singular (`secret`) and plural (`secrets`) aliases accepted.
- **`updateCredential(slug, key, value)` and `removeCredential(slug, key)`** added to `src/app/services/credentials.ts` — save to `credentials.json` (0600) and sync `credentialKeys[]` in `metadata.json` atomically.
- **`hoolix doctor` new checks**: `npx` availability (required for filesystem/github-api/postgres/memory templates), `uvx` availability (required for sqlite template), and `credentials-perms` (flags any `credentials.json` not at mode 0600 on Unix).
- **`hoolix reindex` mcp-server guard**: attempting to reindex an `mcp-server` kind server now exits cleanly with an actionable message pointing to `hoolix secrets set` instead.
- **`--due` reindex loop** now silently skips `mcp-server` kind servers (they have no ingestion pipeline).
- `secrets` and `secret` (singular alias) added to CLI dispatcher and help text with examples.

### Added

- **`hoolix clients list`** — new command listing all 9 supported MCP clients (claude, claude-code, cursor, vscode, windsurf, continue, cline, codex, grokbuild) with detection status (`✓ installed` / `○ dir exists` / `✗ not found`), config file path, and summary counts. Supports `--json`.
- **`hoolix client status`** — scans all detected client config files, reports which Hoolix-managed servers (matched by slug) are present in each `mcpServers` block, shows transport type (http/stdio), and lists any registered Hoolix servers not yet wired into any client. Supports `--json`.
- Both commands dispatched via `hoolix clients` or `hoolix client` (singular alias) + sub-command (`list`, `status`).
- `hoolix connect` now prints a tip line after a successful write: `hoolix client status`.
- Help text updated with new Client integration section entries and examples.

## [0.0.1-beta.12] - 2026-06-04

### Added

- **`hoolix connect` — full mcp-server kind support**: for `mcp-server` servers, `connect` loads `credentials.json`, interpolates `{placeholder}` in the template's `server.args` and `server.env`, and emits `{ command, args, env }` stdio config instead of HTTP streamable. Credentials are never echoed; unresolved placeholders surface a warning.
- **Three new clients in `connect`**: `claude-code` (merges into `~/.claude/settings.json`, adds `type: 'stdio'` field), `vscode` (project-level `.vscode/mcp.json` with `servers` key, VS Code 1.99+), `codex` (OpenAI Codex CLI `~/.codex/config.json`). `detectPreferredClient()` now checks `claude-code` first.
- **`--dry-run` flag on `connect`**: computes and prints the full config snippet without writing any files or creating backups.
- **`hoolix start` graceful mcp-server exit**: for `mcp-server` kind servers, `start` prints an explanatory message and redirects to `hoolix connect` instead of attempting to spawn an HTTP host.
- **`hoolix verify` mcp-server path**: skips all RAG checks for `mcp-server` kind; instead verifies template exists in catalog, credentials are stored, required inputs are present, and the runtime command (`npx`/`uvx`) is available. Supports `--json`.
- **`hoolix info` kind-aware display**: for `mcp-server` kind, shows template, transport, interpolated run config (env keys shown as `KEY=<set>`, never values), stored credential keys, and template inputs instead of chunk/index/freshness fields.
- **`hoolix list` Kind column**: new `Kind` column shows `docs-rag` or `mcp-server`; `mcp-server` rows show `stdio` in the Chunks column and template ID in the Source column.
- **`hoolix templates info` enhanced**: shows `Kind`, `Server run config`, `Credentials` (with env-var auto-detection hints), `Inputs` with `--input` flag examples, and kind-appropriate create command examples.
- **AGENTS.md Rule 9: Two-Kind Template System** — documents the invariants for `docs-rag` vs `mcp-server` kind (when to run ingestion, where credentials live, how to guard RAG operations).

## [0.0.1-beta.11] - 2026-06-04

### Added

- **Phase 1: MCP server platform — two-kind template system** — `CatalogTemplateSchema` gains `kind` (`'docs-rag'` | `'mcp-server'`), `server: ServerRunConfigSchema` (command/args/env with `{input}` and `{credential}` interpolation), `credentials: CredentialInputSchema[]`, and `homepage`. All existing templates now carry `kind: 'docs-rag'` explicitly. Fully backward compatible — existing servers parse unchanged.
- **5 new official `mcp-server` templates**: `filesystem` (`@modelcontextprotocol/server-filesystem`, prompted path), `github-api` (`@modelcontextprotocol/server-github`, `GITHUB_TOKEN`), `postgres` (`@modelcontextprotocol/server-postgres`, `DATABASE_URL`), `sqlite` (`uvx mcp-server-sqlite`, prompted path), `memory` (`@modelcontextprotocol/server-memory`, no credentials). Total official templates: 9.
- **Credential service** — `src/app/services/credentials.ts`: `saveCredentials()` / `loadCredentials()` store sensitive values in a separate `credentials.json` per server with `0600` permissions (never in `metadata.json`). `promptCredentials()` auto-detects from `envVar` (e.g. `GITHUB_TOKEN`) before prompting, supports `nonInteractive` mode for scripted usage. `interpolateRunConfig()` substitutes `{name}` placeholders in command args and env. `maskCredentials()` redacts sensitive values for display.
- **`hoolix create` mcp-server flow**: detects template kind after lookup; prompts for non-sensitive inputs (`--input key=value`) and sensitive credentials (`--credential key=value`; `--env-file .env`); shows masked credentials in the post-create summary; skips ingestion spinner entirely for `mcp-server` kind.
- **`hoolix install <template>`** — alias for `hoolix create --template <id>` added to the CLI dispatcher and help text.
- **`ServerMetadataSchema`** gains `serverKind` (default `'docs-rag'`) and `credentialKeys` (list of credential key names, not values). Existing metadata parses without migration.
- **`CredentialMissingError`** added to `src/core/errors.ts`.
- **`getServerCredentialsPath()`** added to `src/core/paths.ts`.

### Changed

- `createServer()` in `app/services/servers.ts` forks before ingestion: `mcp-server` kind calls `createMcpServerEntry()` (stores credentials, registers metadata, returns empty ingestion result); `docs-rag` kind is completely unchanged.
- `ServerDefinitionSchema.sources` relaxed from `.min(1)` to `.default([])` to allow `mcp-server` kind definitions with no sources. Docs-rag validation is enforced at the service layer.
- `src/commands/import.ts` updated to supply `serverKind` and `credentialKeys` defaults when importing legacy bundles.
- Help text updated to reflect both template kinds, new commands, and mcp-server examples.

## [0.0.1-beta.10] - 2026-06-04

### Changed

- Overhauled user-facing documentation across the README, docs site, CLI help, TUI empty state, GUI copy, and examples to reflect the current Hoolix experience: TUI-first onboarding, trial servers, multi-source definitions, templates, private sources, stdio transport, scheduled reindexing, stats, team-safe bundles, and custom source plugins.

## [0.0.1-beta.9] - 2026-06-04

### Added

- Added Phase 4 growth and ecosystem polish: shared analytics reports powering richer `hoolix stats` and GUI stats cards, team-safe export bundles with `--strip-key`, `--team`, and source-auth stripping by default, `hoolix trial` for one-command npx demos, GUI/TUI trial shortcuts, and JSON-manifest custom source provider hooks via `custom:<provider>:<value>`.

## [0.0.1-beta.8] - 2026-06-04

- Added the Phase 1 server definition foundation: metadata now carries an optional validated `definition` with typed sources, legacy servers are migrated on read, `hoolix create` supports additive repeated `--source type:value` inputs, and CLI/TUI/Web GUI surfaces show compact multi-source summaries without changing existing `--url` behavior.
- Added the Phase 2 official template catalog: `hoolix templates list/info`, `hoolix create --template <id>`, template-backed server definitions, first official templates (`docs-rag`, `github-docs`, `terraform-aws-docs`, `hoolix-docs`), GUI template cards, TUI template shortcuts, and richer MCP source/template labels in documentation tool responses.
- Added Phase 3 transport and reliability polish: scriptable stdio JSON config, optional source auth via `--header` / `--cookie`, incremental reindex fingerprints with `--force`, explicit scheduled reindexing via `--schedule` and `reindex --due`, persisted HTTP rate-limit state, context-window/token-budget aware MCP tool responses, and richer `doctor` / `verify` health signals.

## [0.0.1-beta.7] - 2026-06-04

### Changed

- Added a shared `src/app/` service layer for server create, reindex, verify, list, info, delete, status, and log-tail orchestration so CLI commands, TUI actions, and Web GUI API routes now use the same business logic while preserving existing flags, output shapes, and on-disk server metadata.

## [0.0.1-beta.6] - 2026-06-04

### Added

- **stdio MCP transport** — `hoolix start <slug> --transport stdio` runs the MCP server in-process over stdin/stdout, compatible with Claude Desktop, VS Code extensions, and any MCP client that prefers the stdio transport. All three tools (`search_documentation`, `read_documentation_page`, `get_table_of_contents`) work identically; audit logging is preserved. Human-readable output is written to stderr so the MCP protocol on stdout is never corrupted. The `hoolix start` HTTP output now also prints the matching stdio client config snippet so users see both options at once.
  - New `src/mcp/stdio-host.ts` — self-contained stdio server (no HTTP, no auth key, no rate limiting; trust boundary is OS process ownership).
- **`hoolix stats <slug>`** — analytics dashboard built from the existing `audit.log`. Shows tool call breakdown (with %), top 10 search queries ranked by frequency, top 10 most-retrieved pages, health metrics (avg hits/search, zero-result rate, rate limit events, tool errors), and a 7-day activity bar chart. Supports `--days N` (default 30) and `--json`.
- **GitHub token warnings** — `hoolix create` and `hoolix reindex` now emit a clear `warn`-level message when ingesting a GitHub repo without `GITHUB_TOKEN`: discovery falls back to ~12 files and users see the exact `export GITHUB_TOKEN=<token>` fix. Rate-limited responses from the GitHub API also produce an improved warning with the 60 req/hr vs 5,000 req/hr context.

### Changed

- `hoolix start` output now shows **both** the Streamable HTTP config and the stdio config snippet side-by-side, so users immediately see which format their client needs.
- `hoolix stats` replaces the need to manually parse `hoolix audit` JSON for common usage questions.

## [0.0.1-beta.5] - 2026-06-04

### Added

- **Modular CLI architecture** — Broke the monolithic `src/index.ts` (2,149 lines) into a thin dispatcher (~100 lines) plus one focused module per command under `src/commands/`. Adding a new command now means one new file and one new `switch` case.
  - `src/commands/` — 17 command modules: `list`, `create`, `delete`, `reindex`, `verify`, `info`, `start`, `stop`, `connect`, `rotate`, `audit`, `export`, `import`, `update`, `uninstall`, `doctor`, `gui`.
  - `src/ui/format.ts` — Shared chalk palette, all `print*` helpers, `truncate`, `maskSecret`, `getFreshness`, and formatting types.
  - `src/ui/help.ts` — `printHelp()` in its own module.
  - `src/lib/auth.ts` — `generateAuthKey()` extracted and re-exported from `src/index.ts` for backward compatibility.
  - `src/lib/embedding.ts` — `resolveEmbeddingModel()` deduplicates embedding resolution logic previously copied between `create` and `reindex`.
- **Polished interactive TUI** — Completely rewrote `src/tui/index.tsx`:
  - Full-terminal box-drawing layout (`┌ ─ ┐ │ ├ ┬ ┤ └ ┘`) with outer border and column divider.
  - **Two-column layout**: server list (left) with live `●`/`○` status, port, and highlighted selection; detail panel (right) with name, source, chunks, index type, freshness, masked auth key, and MCP URL.
  - **Log tail panel**: last 5 lines of `host.log` for the selected server, refreshed every 2 s.
  - **Persistent status bar**: key-help line plus a dedicated action-feedback line with auto-clear after 2–3 s.
  - Resize-aware — re-renders on terminal resize.
  - All actions (`s` start/stop, `v` verify, `c` copy MCP config, `x` reindex, `n` copy create command) show inline feedback while running.
  - Empty-state welcome screen with step-by-step instructions for first-time users.
  - Frame-buffer rendering — entire screen written in one `stdout.write` call, eliminating flicker.

### Changed

- `src/index.ts` is now a ~100-line dispatcher; all command logic lives in dedicated modules — each command is independently readable, testable, and extendable.
- Embedding model resolution (`--embedding-model` / `--hybrid` / `config.preferredEmbedding` / `fuse` fallback) is now a single shared `resolveEmbeddingModel()` call instead of copy-pasted logic in `create` and `reindex`.
- TUI replaced console-clear + sequential `console.log` calls with a frame-buffer renderer (`buildFrame`) that writes the entire screen in a single `process.stdout.write` call, reducing flicker.

## [0.0.1-beta.4] - 2026-06-03

### Added

- Added richer `verify` trust signals for source coverage, unique source URLs, ingestion cap/truncation status, duplicate chunk IDs, weak sample queries, and ordered TOC previews in JSON output.
- Added persisted ingestion stats to server metadata so create/reindex caps can be reported later by `verify`.
- Added RAG diagnostics and tests for source coverage, ordered table-of-contents output, and weak-query relevance.
- Added `hoolix export` / `hoolix import` for `.hoolix.json` server bundles, with auth keys omitted by default.
- Added first-run TUI guidance with copyable create-command template for empty registries.
- Added golden-set RAG eval example (`examples/golden-eval.ts` + `examples/golden-set.json`).
- Added ADRs for bundled Web GUI assets, pure-Node TUI, and optional hybrid RAG.

### Changed

- Improved default keyword ranking with phrase, title, section, URL, term-coverage, and weak single-token scoring instead of flat direct-match scores.
- Changed table-of-contents reconstruction to preserve source order rather than alphabetical section-path order.
- Fixed `hoolix gui` startup so default port conflicts auto-select the next free port and explicit `--port` conflicts show an actionable error instead of a raw server stack trace.
- Improved `list`, `info`, and `verify --json` freshness reporting so stale servers are easier to spot before reconnecting agents.
- Improved `connect` by validating auto-written client config entries after merge.
- Improved `audit` with summaries by tool, time range, rate-limit count, top tool, and average hits per search.
- Split Web GUI assets out of `src/web/server.ts` and replaced CDN Tailwind/Font Awesome/font dependencies with bundled local CSS.

## [0.0.1-beta.2] - 2026-06-03

### Removed Support for macOS Intel

App currently hangs during github workflow. Will be investigated later. 

## [0.0.1-beta.1] - 2026-06-03

### Added

- Added MCP tool timeout wrappers (`MCP_TOOL_TIMEOUT_MS`, default 15s) for search, page reads, and table-of-contents requests, with audited tool errors and actionable timeout responses.
- Added JSON output support for lifecycle commands that were previously human-only: `create`, `delete`, `reindex`, `rotate`, `start`, `stop`, `update`, and `uninstall`.
- Added macOS Intel (`hoolix-darwin-x64`) to the release asset matrix.

### Changed

- Masked auth keys in host logs, `info --json`, Web GUI list/info/start responses, and on-screen TUI connect output while preserving explicit full-token payloads for `start`, `connect`, and `rotate`.
- Disabled the background update check during `--json` commands so machine-readable output is not mixed with status warnings.
- Updated README, AGENTS, packaging, release, auth, CLI, and host docs to align TUI, timeout, secret-handling, JSON, and release-asset claims with implementation.
- Windows ARM64 installs now use the shipped Windows x64 release asset under emulation until a native ARM64 asset is published.

## [0.0.1-beta.0] - 2026-06-03

### Added

- First release of **Hoolix**: production-grade CLI + TUI for turning documentation URLs, llms.txt/llms-full.txt, and GitHub repos into authenticated MCP servers.
- Added GitHub-aware ingestion with README/docs tree discovery, heading-aware chunking, per-page source URLs, and default Fuse.js search for grounded results.
- Added `create`, `verify`, `start`, `connect`, `rotate`, `reindex`, `list`, `info`, `doctor`, `update`, and Windows/Linux/macOS install scripts with self-contained binary support.
- Added secure per-server auth keys, rate limiting, append-only audit logs, and support for private GitHub via `GITHUB_TOKEN`.
- Added optional hybrid RAG with lazy BGE embedding + RRF reranker behind `--hybrid` / `--embedding-model`.
- Added one-command client wiring for Claude/Cursor/Windsurf/Continue/Cline/GrokBuild and `--json` scripting support.

[Unreleased]: https://github.com/JayLLM/Hoolix/compare/v0.0.6...HEAD
[0.0.6]: https://github.com/JayLLM/Hoolix/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/JayLLM/Hoolix/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/JayLLM/Hoolix/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/JayLLM/Hoolix/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/JayLLM/Hoolix/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.20...v0.0.1
[0.0.1-beta.20]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.19...v0.0.1-beta.20
[0.0.1-beta.19]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.18...v0.0.1-beta.19
[0.0.1-beta.18]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.17...v0.0.1-beta.18
[0.0.1-beta.17]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.16...v0.0.1-beta.17
[0.0.1-beta.16]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.15...v0.0.1-beta.16
[0.0.1-beta.15]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.14...v0.0.1-beta.15
[0.0.1-beta.14]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.13...v0.0.1-beta.14
[0.0.1-beta.13]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.12...v0.0.1-beta.13
[0.0.1-beta.12]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.11...v0.0.1-beta.12
[0.0.1-beta.11]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.10...v0.0.1-beta.11
[0.0.1-beta.10]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.9...v0.0.1-beta.10
[0.0.1-beta.9]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.8...v0.0.1-beta.9
[0.0.1-beta.8]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.7...v0.0.1-beta.8
[0.0.1-beta.7]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.6...v0.0.1-beta.7
[0.0.1-beta.6]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.5...v0.0.1-beta.6
[0.0.1-beta.5]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.4...v0.0.1-beta.5
[0.0.1-beta.4]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.3...v0.0.1-beta.4
[0.0.1-beta.3]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.2...v0.0.1-beta.3
[0.0.1-beta.2]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.1...v0.0.1-beta.2
[0.0.1-beta.1]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.0...v0.0.1-beta.1
[0.0.1-beta.0]: https://github.com/JayLLM/Hoolix/releases/tag/v0.0.1-beta.0
