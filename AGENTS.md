# AGENTS.md — Hoolix

**This is the single source of truth for AI agents (Grok Build, Claude, Cursor, etc.) and human contributors.**

Follow it exactly. When in doubt, re-read it.

## Project Mission

hoolix turns documentation URLs (llms.txt / llms-full.txt first-class, GitHub repos, regular sites) into fully functional, authenticated, hostable MCP servers (Streamable HTTP) that agents can trust.

It must feel like a **production-grade, daily must-have** tool:
- Robust, observable ingestion (llms + GitHub tree + anti-bot resilience).
- High-quality RAG that actually helps agents (grounded results with Source URLs, optional hybrid semantic).
- Secure-by-default (keys, rotation, rate limits, audit).
- Excellent DX: polished CLI + lightweight TUI (default), `verify` for trust, `connect` magic, `--json` everywhere.
- Zero-friction after simple binary install (`install.sh` / `install.ps1`).
- Best-in-class open-source experience (docs, examples, contribution hygiene).

**Priorities (in order)**:
1. User experience *after installation* (binary "just works", TUI delight, connect in <30s).
2. Ingestion + RAG quality + grounding (this is why the product exists).
3. Security, reliability, cross-platform (especially Windows).
4. Documentation as code (every change updates the right docs + examples).
5. Binary size & startup discipline + lazy loading.

## Tech Stack & Constraints (Strict)

- **Language**: TypeScript strict (no `any` except where the MCP SDK forces it; prefer `unknown` + casts documented).
- **Runtime**: Bun preferred for `bun build --compile` native binaries. Node 20+ fallback. Never assume tsx/npx/source after packaging.
- **CLI**: Hand-rolled dispatcher in `src/index.ts` (switch on `process.argv[2] || 'tui'`, manual `indexOf`/`includes`, `@clack/prompts` for interactive). Every machine-consumable command **must** support `--json`.
- **MCP**: `@modelcontextprotocol/server` + Hono + `WebStandardStreamableHTTPServerTransport`. Tools: `search_documentation`, `read_documentation_page`, `get_table_of_contents`. All responses must include source URLs.
- **RAG**: Fuse.js + direct keyword (default, zero-dep). Optional advanced hybrid (bge-small/base + RRF reranker, query/embed caches, alpha weights) behind `--hybrid` / `--embedding-model` + lazy dynamic import only (see src/rag/{models.ts,store.ts}). Never put LanceDB or always-on embeddings in the hot path without feature flag + migration story. Update advanced-rag.md + AGENTS when changing fusion/eval/model list.
- **TUI**: Lightweight pure-Node raw-mode dashboard (default experience when no args). **Must** be dynamically imported only on the tui path + TTY/raw-mode guard. Non-TUI commands must not pay the cost at runtime. Do not add Ink/React unless an ADR explicitly accepts the binary-size and startup tradeoff.
- **Distribution (critical invariant)**: Packaged binaries (`dist-bin/`) must allow `hoolix start <slug>` and `hoolix` (TUI) with zero external runtime or source. `__internal-host` self-spawn model in `ServerManager` + `host.ts`.
- **Cross-platform**: `env-paths` for all data. `ps-list` + `tree-kill` for process mgmt. No Unix signals/symlinks in core paths. Test Windows early.
- **Validation**: Zod for all persisted + external data.
- **Logging**: `consola` via `src/core/logger.ts` only. Never `console.log` / `console.error` in library code (`core/`, `ingestion/`, `rag/`, `process/`, `mcp/`).
- **Imports**: Relative imports **must** end in `.js` (ESM).
- **Side effects**: Avoid top-level await and heavy init (impacts binary startup + bundling).
- **Errors**: Use custom classes from `src/core/errors.ts` (`MCPPError` + subclasses). Never throw raw strings or vague `Error`.

## Directory Structure (Current)

```
src/
├── index.ts                 # CLI dispatcher (switch on argv[2]); add new command = one case + one file
├── commands/                # One file per CLI command (create, connect, info, list, start, verify, …)
├── core/                    # paths, config, registry (Zod), errors, logger, updater, version
├── ingestion/               # pipeline, fetchers (+ github.ts), cleaners (lazy), chunker, detectors, types
├── rag/                     # store.ts (Fuse + optional hybrid lazy), models.ts, types
├── mcp/
│   ├── host.ts              # HTTP Streamable MCP server (tools, Hono, auth, rate, audit). Static import in index for bundler.
│   └── stdio-host.ts        # Stdio MCP server (foreground, no auth, docs-rag only)
│   └── gateway-host.ts      # Unified HTTP gateway; aggregates configured mcp-server backends with namespaced tools
├── process/
│   └── manager.ts           # ServerManager (spawn, health, Windows-safe ps-list/tree-kill, __internal-host)
├── app/
│   ├── services/            # servers.ts, catalog.ts, credentials.ts, analytics.ts — shared business logic
│   ├── contracts.ts         # TypeScript interfaces for service inputs/results
│   └── events.ts            # AppProgressEvent + emitProgress
├── catalog/
│   └── templates.ts         # CatalogTemplateSchema: both docs-rag + mcp-server kinds; 15 official templates
├── sources/                 # types.ts (ServerDefinitionSchema), registry.ts (CLI parsers), plugins.ts (custom)
├── tui/                     # index.tsx (pure-Node TUI, dynamic import only)
├── web/                     # Hono web GUI
├── lib/                     # auth.ts, embedding.ts (shared utilities)
└── ui/                      # format.ts (chalk helpers), help.ts (printHelp)

bin/hoolix.js                # Shim (dist vs tsx)
dist/                        # tsc output (npm path)
dist-bin/                    # bun build --compile (recommended)
```

## Important Architectural Rules (Never Violate)

### 1. Host Execution Model (Critical — Binary Invariant)
- Packaged: `!process.execPath.includes('node') && !... 'bun'` → spawn `currentBinary __internal-host --slug ...`.
- Dev: `tsx` / `.bin/tsx(.cmd)` + `src/mcp/host.ts`.
- `src/index.ts` has **static** import of host (helps bundler include everything).
- `host.ts` has direct-exec guard (only runs host when the four `--slug/--port/--data-dir/--auth-key` flags are present and not `__internal-host` in argv[0]).
- After packaging, `hoolix start <slug>` and default TUI **must never** require tsx/source on user machine.
- When touching `index.ts` / `manager.ts` / `host.ts`: always test both dev (`bun run dev`) and fresh binary.

### 2. RAG Layer
- Default = Fuse.js + direct keyword + rich per-chunk `metadata` (url, title, sectionPath, headings, order, charCount). **All** search/read/TOC results **must** include `metadata.url` for grounding.
- Hybrid is **optional**, per-server (`embeddingModel`), behind `--hybrid` / config `preferredEmbedding`, lazy dynamic `import('@huggingface/transformers')` + `cosineSimilarity` (pure JS). Embeddings persisted only for hybrid servers (`embeddings.json`).
- Never introduce LanceDB / heavy models into hot path without flag + migration story (see current hybrid implementation).
- `verify` must surface quality (samples, grounding %, mode comparison when hybrid).
- Update `registry` + `config` + `create`/`reindex`/`verify`/`info` when changing models.

### 3. Ingestion Pipeline (Highest Value Area)
- llms.txt / llms-full.txt **first-class** (sibling full, manifest expansion, per-page chunking so `metadata.url` is real page).
- GitHub (`sourceType=github`): special path in `github.ts` (raw priority for llms/README + tree when token, crude ignores + .gitignore, rate detection, graceful fallback to normal fetch). Update docs when changing.
- Heading-aware chunker preserves hierarchy + source URLs (non-negotiable for grounding).
- Progress observable at every stage (for TUI + spinners). `onProgress` in `ingestDocumentation`.
- Lazy heavy (jsdom/Readability) only on HTML path (see `cleaners.ts`).
- UA rotation + curl fallback for anti-bot.
- `detectSourceType` + `parse*` must be unit-tested.

### 4. CLI Philosophy
- Hand-rolled in `index.ts`. Add new command: case in switch + `async function cmdNew(args, json?)`, update `printHelp()`, support `--json` if machine friendly, actionable `logger.error` + "Next step: ...".
- Interactive: `@clack/prompts` (text/select/confirm + isCancel).
- Long-running: spinners + live `onProgress` messages.
- Every new flag/cmd must appear in `doctor` (when healthy) + examples + relevant guide.
- Error messages end with "what the user should do next".

### 5. Cross-Platform (Windows is First-Class)
- `env-paths` everywhere for data.
- Process: `ps-list` + `tree-kill` (never Unix signals).
- Paths: no symlinks in core. Use `path.join`, `fs-extra`.
- Clipboard (connect): platform exec (clip / pbcopy / xclip / wl-copy) — no new dep.
- Test spawn/host/paths on Windows in every release.

### 6. TUI (Default Experience)
- `src/tui/index.tsx` is a pure-Node raw-mode terminal dashboard (no Ink/React dependency today).
- Launched only via **dynamic import** in the default/tui case in `index.ts`.
- TTY + raw-mode guard (`!stdout.isTTY || CI`, plus `setRawMode` probe) + graceful fallback to text help.
- Uses `listServers`, `serverManager.getStatus/start/stop`, `getServerDir` + fs for host.log tail.
- Keyboard-driven (numbers, letters s/v/c/i/x/r/q, arrows). Live poll status. Action feedback. Full token client config may be copied to clipboard, but on-screen secret display must stay masked.
- When adding TUI actions that duplicate CLI (reindex/verify), prefer extracting small pure helpers from `index.ts` (or accept minimal dupe for v1 and note it).

### 7. Optional Hybrid RAG
- Flag + config driven. Lazy dynamic import only.
- `indexChunks(..., {embeddingModel, onProgress})` computes + persists vectors only for hybrid.
- `search(..., {mode})` blends or uses pure semantic when vectors present; falls back cleanly.
- First-run UX must show progress + "model downloading to cache".
- Size/perf: document in FAQ/PACKAGING. Binary grows but non-hybrid paths stay light.
- Update verify/info/list to surface `embeddingModel`.

### 8. Security, Rate, Audit, Key Rotation
- Auth: per-server crypto key (generated at create, only in metadata).
- `rotate <slug>`: new key, update metadata, warn to restart, print old/new.
- Rate: simple in-memory (host middleware), 429 + audit.
- Audit: append-only `audit.log` (ts + tool + query snippet + hits) per server data dir.
- Guards: response size cap + timeout wrapper on tool handlers.
- Keys never logged except at explicit start time.

### 9. Two-Kind Template System (New Platform Invariant)

Templates are typed as `kind: 'docs-rag'` or `kind: 'mcp-server'`. The kind determines the entire server lifecycle.

**`docs-rag` kind** (original):
- `createServer` runs ingestion → chunking → RAG indexing → HTTP host.
- `verify` runs RAG quality checks + grounding.
- `start` spawns an `__internal-host` HTTP server.
- `connect` emits `{ type: 'streamable-http', url, headers }`.
- Registry: `chunkCount > 0`, `vectorIndexed`, `ingestionStats`.

**`mcp-server` kind** (new — config-only in Phase 1):
- `createServer` skips ingestion entirely: stores run config + credentials, registers metadata.
- Credentials stored in a separate `credentials.json` (0600, never in metadata.json) via `src/app/services/credentials.ts`.
- `start` redirects users to `hoolix connect` (client spawns the process over stdio).
- `connect` interpolates `{placeholder}` in the template's `server.args` and `server.env` using template inputs + loaded credentials, emits `{ command, args, env }` stdio config.
- `verify` checks credentials present + runtime tool available; no RAG checks.
- Registry: `serverKind: 'mcp-server'`, `credentialKeys: string[]`, `chunkCount: 0`.

**`mcp-server` proxy mode** (Phase 2+, opt-in):
- `hoolix start <slug> --proxy` spawns `proxy-host.ts` as a detached process (same `__internal-proxy` model as `__internal-host`).
- Proxy host spawns the child stdio server, bridges it to Hono HTTP with auth + rate-limit + audit.
- `.runtime.json` gains `mode: 'proxy'` — `getStatus()` returns `mode: 'http' | 'proxy'`.
- `hoolix connect` checks proxy status: if `mode === 'proxy'`, emits HTTP config; otherwise emits stdio config.
- Runtime file format: `{ pid, port, startedAt, status, mode: 'proxy', childPid, template }`.
- SSE phase 1: when client sends `Accept: text/event-stream`, the synchronous JSON-RPC response is wrapped as an SSE `data:` event. Full bidirectional SSE streaming is a future MINOR.
- Auto-restart: child process is restarted on unexpected exit (exponential backoff: 1s, 2s, 4s, 8s, 16s; max MAX_RESTARTS=5 attempts). After max restarts, proxy marks itself degraded and returns HTTP 503.
- Health monitoring: 30-second `ping` fire-and-forget to detect silent hangs (timeout handled by the pending-map timeout).
- `hoolix list` shows `proxy:PORT` in the Status column for mcp-server kind servers running in proxy mode.
- `hoolix doctor` reports which servers are currently running in proxy mode.

**Rules**:
- Never run the ingestion pipeline for `mcp-server` kind.
- Never put credential values in metadata.json — store key names only (`credentialKeys[]`).
- Always check `meta.serverKind ?? 'docs-rag'` before RAG operations; skip gracefully for mcp-server.
- `interpolateRunConfig()` is the single source of truth for substituting `{name}` placeholders.
- When adding a new command that touches RAG, add a `serverKind === 'mcp-server'` guard.
- Adding a new `mcp-server` template: add to `src/catalog/templates.ts` OFFICIAL_TEMPLATES array only.

#### Community Templates

Users can drop custom `*.json` files into `~/.hoolix/templates/` (or override with `HOOLIX_TEMPLATE_DIR`) to create third-party or private templates. The loader (`src/catalog/community.ts`) validates each file against `CatalogTemplateSchema`, emits `logger.warn` for invalid files, and returns valid templates sorted by ID. `listTemplates()` transparently merges official + community.

**Minimum community template JSON** (use `hoolix templates info <id>` for the full official format):

```json
{
  "id": "my-jira",
  "name": "Jira MCP",
  "version": "1.0.0",
  "kind": "mcp-server",
  "category": "community",
  "description": "Query Jira issues via MCP.",
  "tags": ["jira"],
  "inputs": [
    { "name": "jiraHost", "label": "Jira host", "description": "e.g. your-org.atlassian.net", "required": true }
  ],
  "credentials": [
    { "name": "jiraToken", "label": "Jira API Token", "description": "Atlassian API token",
      "envVar": "JIRA_API_TOKEN", "required": true, "sensitive": true }
  ],
  "sources": [],
  "server": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "mcp-jira@latest", "--host", "{jiraHost}"],
    "env": { "JIRA_API_TOKEN": "{jiraToken}" }
  }
}
```

- `hoolix templates list --community` shows community templates and prints the directory.
- `hoolix doctor` reports the community template count.

### 10. Shell Completions + Bundle

### 10. Unified Gateway (Local MCP Control Plane)

`hoolix gateway` creates one authenticated Streamable HTTP MCP endpoint that aggregates multiple configured `mcp-server` instances.

- Gateway config lives separately under `gateways/<slug>/gateway.json`; do not overload `servers/<slug>/metadata.json`.
- Backing servers remain normal `mcp-server` instances. Credentials stay in each backing server's `credentials.json`; gateways store only backend slugs, namespaces, template IDs, and their own auth key.
- `gateway-host.ts` spawns child stdio MCP servers from existing template run configs, initializes them, aggregates `tools/list`, and forwards `tools/call`.
- Gateway tool names must be collision-free and namespaced as `<namespace>.<toolName>`.
- Gateways use their own `data/audit.log`, `data/rate-state.json`, and `.runtime.json`.
- `hoolix connect <gateway>` and `hoolix gateway connect <gateway>` should both prefer the gateway HTTP endpoint.
- Human approvals and policy are future gateway features; do not fake policy enforcement in unrelated commands.

### 11. Shell Completions + Bundle

**Shell completions** (`hoolix completion <shell>`):
- Outputs a ready-to-source script for bash, zsh, fish, or powershell.
- Dynamic slug completion: calls `hoolix list --json` at tab-time.
- Dynamic template ID completion: calls `hoolix templates list --json` at tab-time.
- Update check is suppressed for the `completion` command (output must be clean — no update banners).
- Add new commands to `COMMANDS` array in `completion.ts` when adding to `index.ts`.

**Multi-server bundle** (`hoolix bundle export|import`):
- `src/commands/bundle.ts`: multi-server export (`type: 'multi-server-bundle'`, `version: 1`).
- Credentials are NEVER exported (same invariant as single-server `export`).
- After `bundle import`, credential commands are printed for each mcp-server slug.
- JSON output of `bundle import` includes `credentialsRequired`, `next[]`.

### 12. Documentation as Code (Non-Negotiable)
- Every CLI/behavior change → update:
  - README (hero, table, quickstart, examples, limitations, "why").
  - Relevant `docs/docs/guides/*` + `getting-started/*`.
  - `docs/docs/api-reference/cli.md` + architecture pages.
  - Inline JSDoc + AGENTS if arch changed.
  - `examples/` + benchmark if new capability.
  - CHANGELOG (or let release-it pick it up).
- Run `cd docs && npm start` locally after docs changes.
- Architecture diagrams: Mermaid code blocks + ASCII. (Docusaurus can add remark-mermaid later.)
- "How to keep documentation perfect" section below.

### 13. Contribution & Agent Workflow
- **Always** start with issue / discussion for anything > tiny.
- Use `todo_write` for multi-step work (this session did).
- For ambiguity or large design: `enter_plan_mode` → explore (use `spawn_subagent` with type "explore" for parallel) → write plan → `exit_plan_mode`.
- Small PRs preferred. Tests + docs required.
- Before submit: `bun test`, `npx tsc --noEmit`, fresh binary smoke for dist changes.
- Review checklist in PR template.

### 14. npm Package + Release Invariants

**npm global package (`npm install -g hoolix`):**
- `bin/hoolix.js` uses `await import(distEntry)` in the SAME process (no subprocess). Gives correct signal handling (TUI Ctrl+C) and fast startup.
- `npm run build` (tsc → dist/) runs via `prepublishOnly` before `npm publish`.
- `npm publish --provenance` in CI requires `id-token: write` permission.
- `dist/index.js` is the compiled entry point; it's included in `"files"`.
- Update check is skipped for `completion` command (clean output required).

**SHA-256 checksums + GPG signing:**
- `SHA256SUMS` is generated in `attach-release-assets` job and attached to every GitHub Release.
- GPG `.asc` signatures generated only if `GPG_PRIVATE_KEY` repo secret is set (optional).
- `hoolix update` downloads `SHA256SUMS` and verifies the hash before applying. `--no-verify` skips.
- `install.sh` and `install.ps1` both verify SHA-256 when `SHA256SUMS` is available.

**Release flow:**
1. `release.yml` → `prepare-release` (release-it → bump, CHANGELOG, tag, GitHub Release)
2. `build-binaries` (matrix: linux-x64, linux-arm64, darwin-x64 [macos-13], darwin-arm64 [macos-14], windows-x64)
3. `publish-npm` (build + `npm publish --provenance --tag latest|next`) — all releases; prerelease → `--tag next`
4. `attach-release-assets` (SHA256SUMS + optional GPG .asc + release notes with install cmds)

**Version file:** `src/core/version.ts` — `export const VERSION = "x.y.z"`. Must match `package.json`. Baked into binaries at `bun build --compile`.

## Development Workflow

```bash
bun install
bun run dev                 # or npx tsx src/index.ts
npx tsc --noEmit -p tsconfig.json
bun test
bun run test:e2e             # isolated temp-data CLI/TUI/host regression suite
bun run build:binary        # (or :win)
./dist-bin/hoolix doctor
./dist-bin/hoolix create "Test" --url https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md --yes
./dist-bin/hoolix verify test
./dist-bin/hoolix connect test --client generic --json
./dist-bin/hoolix delete test --yes
```

TUI: `bun run dev` (no args) or the built binary.

Docs site: `cd docs && npm install && npm start`.

## Coding Standards (Expanded)

- **Strict TS**: No implicit any. Explicit return types on public fns. Prefer `unknown`.
- **Errors**: Custom MCPP* classes + `isMCPPError`. Actionable + "Next: ...".
- **Validation**: Zod for persisted (registry/config) and tool inputSchemas.
- **Logging**: Only `logger.*` from core/logger. No console in lib code.
- **Imports**: `.js` suffix. Dynamic for heavy/optional (TUI, hybrid, GitHub tree when possible).
- **Lazy / Size**: Follow `cleaners.ts` pattern exactly. New heavy dep requires ADR + FAQ update + conditional load.
- **Binary discipline**: Measure impact (`ls -lh` before/after). Document in PACKAGING/FAQ. Test both dev + packaged.
- **Tests**: Unit for pure (chunker, parse, cosine, registry). Integration smoke and CLI e2e must use `MCP_PORTAL_DATA_DIR` temp roots and never touch real user data. Keep e2e helpers in `test/helpers/`, run `bun run test:e2e` for create → verify → connect → rotate → TUI test keys → start/stop, and cover private GitHub with mocks unless a secret-backed job is explicitly added. Binary smoke + size budget run in CI.
- **Docs**: Update the right files (see "documentation perfect" below). Add examples.
- **Performance**: Hot paths (search, chunk) must stay fast. Brute cosine ok for 6k. Batch embeddings.
- **Windows**: Every process/path/clipboard change tested or reviewed for Win.

## When Touching Distribution Code (index, manager, host, tui, package.json for new deps)

- Update PACKAGING.md + RELEASE.md.
- Test full install → create → verify → start → connect → rotate → TUI actions with freshly built binary.
- Note size change + lazy rationale.
- Update doctor / help text.

## Contribution Workflow (Humans + Agents)

1. Read AGENTS.md + open issue.
2. Explore (use tools + spawn_subagent type=explore for parallel deep dives).
3. If ambiguous/large: enter_plan_mode → thorough reads → design tradeoffs → write plan.md → exit_plan_mode (user approves).
4. Implement with `todo_write` tracking (mark done immediately, one at a time).
5. Small focused changes. Use search_replace for precision.
6. Add/extend tests. Update docs immediately (not "later").
7. Run final verification (test, typecheck, binary build, smoke).
8. PR with template filled (links issue, lists docs changes, binary test evidence).

**Agent-specific**:
- You (Grok Build) must use `todo_write`, `spawn_subagent` for exploration, `enter/exit_plan_mode` for ambiguity, `read_file`/`grep` before edits.
- After every significant block: run typecheck or test snippet.
- Never skip docs or tests "to save time".
- At end of session: produce the exact output format (summary, key files + diffs, full new AGENTS, remaining recs, confirmation of `bun test` + binary).
- Prioritize: UX post-install > RAG/ingest quality > size/perf > open-source hygiene.

## How to Keep Documentation Perfect (Gold Standard)

Map of changes → files that **must** be touched:
- New CLI command/flag: README (table + quickstart + examples), `src/index.ts` (help text), `docs/docs/api-reference/cli.md`, relevant guide (connecting or creating), examples/ if applicable, CHANGELOG.
- RAG / hybrid change: architecture/rag-and-tools.md, FAQ binary-size, verify output in code + docs, README features/limitations, AGENTS.md.
- Ingestion (GitHub etc.): architecture/ingestion-pipeline.md, api-ref/ingestion, README features, guides/multi-page or new GitHub guide, faq/fetch.
- TUI: README (quickstart), guides (new or connecting), architecture/host-process or new tui page, FAQ, AGENTS.
- Security (rotate/rate/audit): security/auth guide, README, architecture/host, doctor output.
- Binary / packaging: PACKAGING.md, RELEASE.md, FAQ binary, README install, CI workflows comments.
- Docs site structure: sidebars.js + intro if new top-level.

**Process**:
- Make the code change.
- Immediately edit the docs (use precise search_replace).
- Locally `cd docs && npm start` and spot-check the pages.
- Use Mermaid ```mermaid blocks + ASCII diagrams.
- Consistent voice: "hoolix <cmd>", actionable, "grounding URLs", "production-grade".
- Update AGENTS.md for any new architectural rule or agent guideline.

## Architecture Decision Records (ADR)

For any non-trivial design choice (new heavy dep, major refactor, transport addition, hosted model):
- Create `docs/adr/NNNN-short-title.md` (use template below).
- Link it from AGENTS, architecture overview, and the PR.
- Keep short (context, decision, consequences, status).

**ADR Template** (copy to new file):

```markdown
# ADR-000N: Title

**Date**: YYYY-MM-DD  
**Status**: Proposed | Accepted | Deprecated

## Context
One paragraph problem + constraints (AGENTS rules, size, UX after install, etc.).

## Decision
What we chose + why (tradeoffs vs 2-3 alternatives).

## Consequences
Positive (UX, quality). Negative (size, complexity) + mitigation (lazy, docs, flag).

## References
PR, issues, code paths, AGENTS sections.
```

## Questions? When Stuck

1. Re-read the priorities at top of this file.
2. Re-read the 10 Architectural Rules.
3. Use tools to explore (grep/read + subagents).
4. Prefer small, documented, tested change that improves post-install UX or RAG grounding.
5. Ask in issue / discussion with context + what you tried.

This project should feel like the tool serious agentic AI engineers install on day one and recommend without hesitation.

**Now go build.** Use the todo system, explore first, document everything, ship quality.
