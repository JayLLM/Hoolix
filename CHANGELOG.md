# Changelog

All notable changes to **Hoolix** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1-beta.3] - 2026-06-03

### Added

- Added richer `verify` trust signals for source coverage, unique source URLs, ingestion cap/truncation status, duplicate chunk IDs, weak sample queries, and ordered TOC previews in JSON output.
- Added persisted ingestion stats to server metadata so create/reindex caps can be reported later by `verify`.
- Added RAG diagnostics and tests for source coverage, ordered table-of-contents output, and weak-query relevance.

### Changed

- Improved default keyword ranking with phrase, title, section, URL, term-coverage, and weak single-token scoring instead of flat direct-match scores.
- Changed table-of-contents reconstruction to preserve source order rather than alphabetical section-path order.
- Fixed `hoolix gui` startup so default port conflicts auto-select the next free port and explicit `--port` conflicts show an actionable error instead of a raw server stack trace.

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

[Unreleased]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.3...HEAD
[0.0.1-beta.3]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.2...v0.0.1-beta.3
[0.0.1-beta.2]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.1...v0.0.1-beta.2
[0.0.1-beta.1]: https://github.com/JayLLM/Hoolix/compare/v0.0.1-beta.0...v0.0.1-beta.1
[0.0.1-beta.0]: https://github.com/JayLLM/Hoolix/releases/tag/v0.0.1-beta.0
