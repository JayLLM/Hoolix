---
sidebar_label: Environment
sidebar_position: 1
---

# Environment Variables

| Variable                  | Effect |
|---------------------------|--------|
| `MCP_PORTAL_LOG_LEVEL`    | `debug` raises consola to level 4 (very verbose) |
| (none for data dir)       | Use `env-paths` — see [Paths](./paths-and-data) |

No other runtime env vars are read by the hot path.

## Build / Release Time

- `bun build --compile --minify` bakes `VERSION` and prunes unused modules (the lazy require in cleaners is key).
- Release automation uses `release-it` + `@release-it/keep-a-changelog`.
- `scripts/sync-version.cjs` syncs `src/core/version.ts` from `package.json` during release bumps.

## See Also

- [Paths and Data](./paths-and-data)
- [Registry and Validation](./registry-and-validation)
- [RELEASING.md](https://github.com/JayLLM/hoolix/blob/main/docs/RELEASING.md) (in repo root docs/)
