---
sidebar_label: Testing
sidebar_position: 4
---

# Testing

hoolix's release confidence comes from four layers that stay DRY and isolated:

1. **Unit tests** for pure ingestion, RAG, GitHub parsing, and process-planning behavior.
2. **Integration smoke** for real ingestion + RAG grounding, always with an isolated data directory.
3. **CLI/TUI/host e2e** for the user journey after installation: create → verify → connect → rotate → TUI keys → start/stop.
4. **Binary CI smoke** for compiled executables on Linux, macOS, and Windows, including a size budget and TUI launch check.

## Data Isolation

Tests must never write to a contributor's real env-paths directory. Use the shared override instead:

```bash
MCP_PORTAL_DATA_DIR="$(mktemp -d)" bun test
```

`src/core/paths.ts` reads `MCP_PORTAL_DATA_DIR`, and tests can call `resetPathsForTests()` when changing the environment inside a process. E2E tests should use helpers from `test/helpers/e2e.ts` so cleanup, CLI spawning, local docs fixtures, and update-check suppression stay consistent.

## Unit and Integration Tests

```bash
bun test
```

This runs Vitest unit tests plus the isolated integration smoke in `test/integration-smoke.test.ts`. The network smoke skips gracefully when the public fixture is unavailable, but it still verifies that the test data root is temporary and that grounded RAG results contain source URLs when ingestion succeeds.

Useful patterns:

- Keep pure logic tests next to `test/*.test.ts`.
- Mock private GitHub behavior instead of requiring repository secrets in local tests.
- Test process-management decisions with `buildHostSpawnPlan()` instead of duplicating spawn logic.

## CLI/TUI/Host E2E

```bash
bun run test:e2e
```

The e2e suite spawns the real CLI with `node --import tsx src/index.ts`, serves local markdown from an in-process HTTP fixture, and uses a temporary `MCP_PORTAL_DATA_DIR`. It asserts stdout, registry files, chunks, JSON output, key rotation, TUI keyboard replay, host health, stop, and delete.

The TUI has a deterministic test mode for headless CI:

```bash
MCP_PORTAL_TUI_TEST_MODE=1 MCP_PORTAL_TUI_KEYS='v,c,q' bun run dev tui
```

`MCP_PORTAL_TUI_KEYS` is a comma-separated replay script. Prefer lightweight keys such as `r`, `v`, `c`, and `q`; avoid `x` in CI unless the fixture source is local and deterministic.

## Full Flow Testing Before Release

```bash
bun run dev create "Test Docs" --url https://docs.x.ai/llms.txt --yes
bun run dev verify test-docs --json
bun run dev connect test-docs --client generic --json
bun run dev rotate test-docs --yes
bun run dev start test-docs
curl -s http://127.0.0.1:3456/health
bun run dev stop test-docs
bun run dev delete test-docs --yes
```

Also build a binary and repeat the flow with the executable, because compiled `hoolix start <slug>` must self-spawn `__internal-host` with no source files or external runtime.

## Binary Size / Launch Checks

After `bun run build:binary:win` (or equivalent), confirm:

- Binary launches (`dist-bin\hoolix.exe --version`).
- `doctor --json` succeeds or reports actionable environment issues.
- `list --json` works with an empty isolated registry.
- TUI test mode launches without a real terminal.
- A create from a real or local small source succeeds, then `verify`, `connect --json`, `start`, health check, `stop`, and `delete` work.
- Binary size stays under the CI budget unless an ADR documents why the limit changed.

CI now runs unit/typecheck on Linux, macOS, and Windows; the isolated CLI/TUI/host e2e suite on Ubuntu; and binary smokes with size checks on Linux, macOS, and Windows. Release/manual binary workflows repeat the binary launch checks before uploading artifacts.

## See Also

- [CI workflow](https://github.com/JayLLM/hoolix/blob/main/.github/workflows/ci.yml)
- [Manual binary workflow](https://github.com/JayLLM/hoolix/blob/main/.github/workflows/build-binaries.yml)
- [Release workflow](https://github.com/JayLLM/hoolix/blob/main/.github/workflows/release.yml)
- [Development Setup](./development-setup)
