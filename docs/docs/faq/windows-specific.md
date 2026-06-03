---
sidebar_label: Windows Specific
sidebar_position: 2
---

# Windows-Specific Issues

## Spawn / Start Failures

- The dev path tries `node_modules/.bin/tsx.cmd` first (more reliable than `node --import tsx` on some Node 20+ Windows setups).
- If that fails, the fallback command is printed.
- Always run `hoolix doctor` and include the "Exec" line when reporting.

## Process Management

- No Unix signals → `ps-list` + `tree-kill` (SIGTERM then SIGKILL) is used for both liveness and `stop`.
- Stale `.runtime.json` files are cleaned when the pid is no longer in the process list.

## Paths

- Data lives under `%APPDATA%\hoolix` (or equivalent via env-paths).
- Long paths or permission issues on corporate machines can cause `ensureDirectories` to fail — `doctor` will surface this.

## Binary Size on Windows

The same lazy-loading that fixed the css-tree crash also dropped the exe from ~128 MB range to ~95 MB. Rebuild after any change to `cleaners.ts`.

## See Also

- [Common Issues](./common-issues)
- [Development Setup - Windows notes](../contributing/development-setup)
- `src/process/manager.ts` (the isNodeOrBun + .cmd logic)
