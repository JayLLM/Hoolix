---
sidebar_label: Pull Requests
sidebar_position: 3
---

# Pull Requests

1. Read AGENTS.md and follow the "user experience after installation" priority.
2. Make small, focused changes. One logical change per PR when possible.
3. Update or add tests (unit for pure logic, E2E via verify script or real `create/start` flows).
4. Run `npx tsc --noEmit` and `bun test --run` locally.
5. If you touch `src/index.ts`, `src/process/manager.ts`, or `src/mcp/host.ts`, manually test both dev (`tsx`) and a freshly built binary on at least Windows. (CI now also runs quick + fuller binary smokes on every build.)
6. Update relevant docs (this site) and CHANGELOG.md when behavior or UX changes.
7. For release-related changes, also look at `.release-it.json`, `release.yml`, and `docs/RELEASING.md`.

## Commit Messages

Follow conventional commits (the 6 commits for this very documentation task are the canonical example in the repo history).

## See Also

- [Testing](./testing)
- [Code Style](./code-style)
- [Release process (internal)](https://github.com/JayLLM/hoolix/blob/main/docs/RELEASING.md)
