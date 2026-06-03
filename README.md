# Hoolix

**Product:** Hoolix | **Repository:** [JayLLM/hoolix](https://github.com/JayLLM/Hoolix)

[![npm version](https://img.shields.io/npm/v/hoolix?color=blue)](https://www.npmjs.com/package/hoolix)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build](https://img.shields.io/github/actions/workflow/status/JayLLM/hoolix/release.yml?branch=main)](https://github.com/JayLLM/hoolix/actions)
[![Docs](https://img.shields.io/badge/docs-Docusaurus-25c2a0?logo=docusaurus)](https://jayllm.github.io/hoolix/)

> **Forge documentation into powerful, secure MCP servers.**

Hoolix turns any documentation URL (llms.txt / llms-full.txt, GitHub repos, or regular docs sites) into a fully functional, authenticated MCP server using the official Model Context Protocol (Streamable HTTP transport).

**The default daily tool for agentic AI engineers** — give your agents (Grok, Claude, Cursor, Windsurf, Continue, Cline, Aider, etc.) high-quality, grounded, source-linked documentation tools in seconds.

**Current status**: Production-grade beta with a lightweight TUI, hybrid RAG foundation, GitHub-aware ingestion, one-command client wiring (`connect`), key rotation, tool timeouts, rate limiting + audit, and best-in-class docs. Binaries "just work" after install.

## Installation (Recommended: Prebuilt Binaries)

The easiest way to get a fast, zero-dependency Hoolix binary is with the official install scripts. They download the correct native binary for your platform from GitHub Releases. During beta, `latest` includes prerelease builds; pass `--stable` / `-Stable` once stable releases are available.

### macOS / Linux

```bash
# Latest (recommended)
curl -fsSL https://raw.githubusercontent.com/JayLLM/Hoolix/main/install.sh | bash

# Specific version
curl -fsSL https://raw.githubusercontent.com/JayLLM/Hoolix/main/install.sh | bash -s -- --version v0.0.1-beta.0

# Stable releases only
curl -fsSL https://raw.githubusercontent.com/JayLLM/Hoolix/main/install.sh | bash -s -- --stable
```

The script installs to `~/.local/bin`, shows PATH guidance if needed, and verifies the installed binary.

### Windows (PowerShell)

```powershell
# Latest (recommended)
iex (irm https://raw.githubusercontent.com/JayLLM/Hoolix/main/install.ps1)

# Specific version
$version = "v0.0.1-beta.0"
iex (irm https://raw.githubusercontent.com/JayLLM/Hoolix/main/install.ps1) -ArgumentList @($version)

# Stable releases only
iex (irm https://raw.githubusercontent.com/JayLLM/Hoolix/main/install.ps1) -ArgumentList @("-Stable")
```

Installs to `%LOCALAPPDATA%\Programs\hoolix`, updates PATH (new terminal required), and runs doctor.

Prebuilt binaries are strongly recommended for the "just works" experience.

## Quick Start

```bash
# 1. Create (llms.txt preferred; GitHub URLs now auto-discover READMEs + docs/)
hoolix create "xAI Docs" --url https://docs.x.ai --yes

# 2. Verify RAG health + grounding (critical)
hoolix verify xai-docs

# 3. Start (prints client JSON)
hoolix start xai-docs

# 4. One-command wiring for your client (auto backup + merge)
hoolix connect xai-docs --client cursor     # or claude, windsurf, continue, cline, grokbuild
# Then reload/restart the client. Test prompt: "Use search_documentation for installation instructions."
```

TUI (default): just run `hoolix` with no args for an interactive dashboard (start/stop/verify/connect/reindex, log tail, masked on-screen secrets with full config copied only when requested).

That's it — self-contained binary, auth, grounded tools (`search_documentation`, `read_documentation_page`, `get_table_of_contents`).

## Common Commands

| Command                        | Description                                      |
|--------------------------------|--------------------------------------------------|
| `create [name] --url <url>`    | Create (llms.txt/GitHub); --hybrid or --embedding-model for advanced hybrid (RRF, caches)  |
| `verify <slug>`                | Health + samples + relevance + grounding score   |
| `start <slug>`                 | Start + printed config + connect tip             |
| `connect <slug> [--client X]`  | Auto-config client (claude/cursor/...; --project)|
| `rotate <slug>`                | Rotate auth key                                  |
| `stop <slug>` / `reindex`      | Lifecycle + rebuild (supports --hybrid)          |
| `list` / `info <slug>`         | Registry + running status + index type           |
| `doctor [--json]`              | Full diagnostics                                 |
| `update`                       | Self-update the binary                           |
| `uninstall [--yes]`            | Complete removal (data + binary + PATH on Win)   |
| (no args)                      | Launch TUI dashboard (start/stop/verify/connect) |

All lifecycle and machine-consumable commands support `--json` for scripting.

## Features

- **llms.txt + GitHub first-class** — auto-discovers `llms.txt`/`llms-full.txt`, GitHub READMEs + docs/ + tree (with token), multi-page, heading-aware chunking
- **RAG that grounds agents** — Fuse.js (default, zero-dep) + optional advanced hybrid (BGE-small/base + RRF reranking, smart caches, --hybrid/--embedding-model). Every result ships `Source: <url>` + sectionPath. See docs for eval & best practices.
- **One-command client wiring** — `connect <slug> --client cursor|claude|...` (auto-merge, .bak, clipboard, per-client instructions + test prompt)
- **Interactive TUI dashboard** (default when no args) — list, live status, keyboard actions for start/stop/verify/connect/reindex, log tail, masked on-screen secrets
- **Secure & reliable** — per-server keys + `rotate`, MCP tool timeout wrappers (`MCP_TOOL_TIMEOUT_MS`), advanced rate limiting (env-configurable, 429 + Retry-After), append-only + queryable `audit.log` (`hoolix audit <slug>` with filters + auto-rotation), response guards. Private GitHub fully supported via `GITHUB_TOKEN` (raw + tree).
- **Self-contained binaries** — `hoolix start` (and TUI actions) work after `install.sh` with no runtime/source
- **DX gold** — `verify` (samples + relevance + grounding score), `reindex`, `doctor`, `--json` for lifecycle and machine-consumable commands, actionable errors
- **Cross-platform** — Windows-first (ps-list, tree-kill, .cmd, PowerShell installer) + mac/linux arm/x64

## How It Works (High Level)

1. `create` (or TUI) fetches (llms-first + GitHub tree/READMEs).
2. Heading-aware chunk + per-page URLs for perfect grounding.
3. Fuse (default) or hybrid BGE index.
4. `start` / TUI action launches the authenticated host (self-contained in binary).
5. Clients use the printed `connect` config. Tools always return `Source:` URLs.

## Why Hoolix (vs alternatives)

- Raw context / copy-paste: loses structure, no live updates, token waste.
- Other MCP doc servers: often toy wrappers, no llms-first, no verify, no TUI, no connect magic, no binary self-host.
- Hosted RAG APIs: cost, privacy, no offline, vendor lock.
- Hoolix: local, free, grounded, production auth, one-binary, TUI, GitHub native, `verify` trust signal, and open-source with gold docs.

We optimize for "agent actually finds the right paragraph with a URL".

## Limitations (v0.0.1-beta)

- Advanced hybrid RAG is optional (BGE models via lazy transformers). First use downloads model to HF cache; base experience is always pure Fuse.js zero-dep. New: RRF reranker + caches + --eval. Larger models have higher one-time cost (documented).
- Full public hosted / multi-tenant / TLS is not built-in (localhost + reverse proxy today; Phase 2 cloud path).
- Some heavily anti-bot sites still need direct llms.txt URL (we have UA rotation + curl fallback + GitHub token support).
- No stdio transport (Streamable HTTP only — covers all modern clients).
- TUI requires interactive TTY (graceful fallback in CI/pipes).

See the roadmap in docs for the path to "must-have for every agentic user".

## Development

**Bun is strongly recommended.**

```bash
bun install

# Run from source
bun run dev          # or npx tsx src/index.ts

# Type check
npx tsc --noEmit -p tsconfig.json

# Run tests
bun test

# Build Windows binary
bun run build:binary:win

# Work on / preview the documentation site (Docusaurus)
cd docs && npm install && npm start
# Production build: npm run build (outputs to docs/build)
```

The documentation site at the "Docs" badge URL above is **automatically deployed** to GitHub Pages via GitHub Actions (see `.github/workflows/deploy-docs.yml`) on any push that touches `docs/**` (or manual `workflow_dispatch`). It uses the official `actions/deploy-pages` flow.

See `AGENTS.md` for architectural rules and contribution guidelines.

## Contributing

Contributions are welcome! Please:

1. Open an issue for discussion before large changes.
2. Run `npx tsc --noEmit` and `bun test` before submitting.
3. Keep changes minimal and focused.

For major work, refer to `AGENTS.md`.

## Releasing

We use an automated process based on `release-it` for versioning, changelog, and GitHub Releases (including betas).

- See [docs/RELEASING.md](./docs/RELEASING.md) for the full guide.
- Local: `npm run release` (or `release:beta`).
- Manual CI trigger: Actions → "Release" workflow (choose type including beta).
- Binaries are automatically built and attached.

## License

MIT © Hoolix contributors

---

**Links**: [GitHub](https://github.com/JayLLM/Hoolix) • [Issues](https://github.com/JayLLM/Hoolix/issues) • [Releases](https://github.com/JayLLM/Hoolix/releases)

Made for AI engineers who want their documentation to actually be useful to agents.
