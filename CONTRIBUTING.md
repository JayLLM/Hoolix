# Contributing to Hoolix

Thank you for helping make the best open-source tool for turning docs into agent-ready MCP servers.

**First:** Read [AGENTS.md](./AGENTS.md) (the canonical guide for humans *and* AI agents working on this repo).

## Quick Rules
- Open an issue (or comment on an existing one) **before** large changes.
- Keep PRs small and focused.
- Every user-facing change requires:
  - Updated tests (or new integration smoke)
  - Updated docs (README + relevant guide + cli-ref + inline comments)
  - Entry in CHANGELOG.md (under Unreleased) or handled by release-it
  - `bun test && npx tsc --noEmit` clean
- Binary/distribution changes (`src/index.ts`, `src/process/manager.ts`, `src/mcp/host.ts`) must be tested with a fresh `bun run build:binary` + full create → verify → start → connect flow.

## Development
```bash
bun install
bun run dev          # or npx tsx src/index.ts
npx tsc --noEmit
bun test
bun run test:e2e    # isolated CLI/TUI/host flow
bun run build:binary # test the exe
./dist-bin/hoolix doctor
```

See AGENTS.md for full workflow, coding standards, lazy-loading rules (size), host model, and "how to keep documentation perfect".

## Issue / PR Process
1. Search issues + discussions.
2. Open issue with reproduction / motivation / proposed design (small PRs welcome after discussion).
3. Fork + branch from `main`.
4. Make the change + tests + docs.
5. `bun test && bun run test:e2e && npx tsc --noEmit` for changes that affect CLI, TUI, ingestion, host process, registry paths, or distribution.
6. Open PR using the template. Link the issue.
7. CI (typecheck, tests, binary build) must pass.
8. Be responsive to review. We value clear, minimal, well-documented changes.

## Code of Conduct
Be kind, professional, and focused on making Hoolix the daily default for agentic engineers.

## Questions?
Use GitHub Discussions or open an issue with the "question" label.

We especially welcome contributions that improve:
- RAG quality (hybrid, grounding, multi-doc)
- Client UX (connect flows, TUI, one-click)
- Ingestion (more GitHub, private, robust anti-bot)
- Documentation & examples
- Cross-platform / Windows reliability
- Open-source polish (templates, benchmarks, website)

Let's make every agentic AI engineer install Hoolix on day one.
