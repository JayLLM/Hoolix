# Changelog

All notable changes to **Hoolix** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.5...HEAD
[0.0.1-beta.5]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.4...v0.0.1-beta.5
[0.0.1-beta.4]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.3...v0.0.1-beta.4
[0.0.1-beta.3]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.2...v0.0.1-beta.3
[0.0.1-beta.2]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.1...v0.0.1-beta.2
[0.0.1-beta.1]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.0...v0.0.1-beta.1
[0.0.1-beta.0]: https://github.com/JayLLM/Hoolix/releases/tag/v0.0.1-beta.0
