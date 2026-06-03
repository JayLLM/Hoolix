---
sidebar_label: Host and Process Model
sidebar_position: 4
---

# Host and Process Model

This is the most critical architectural boundary in the project (see AGENTS.md "Host Execution Model").

## The Two Worlds

**Packaged binary (user after `install.ps1` / `bun build --compile`):**

- `hoolix start foo` detects `!process.execPath.includes('node') && !includes('bun')`
- Spawns `currentBinary __internal-host --slug foo --port N --data-dir ... --auth-key ...`
- The **same** binary executable re-enters via the guard at the bottom of `src/mcp/host.ts`
- No tsx, no source files, no node_modules on the target machine.

**Development / tsx / `bun run dev`:**

- Prefers `node_modules/.bin/tsx(.cmd)` (Windows reliable)
- Falls back to `node --import tsx src/mcp/host.ts ...`
- The static `import { startHostedServer } from './mcp/host.js'` in `src/index.ts` helps the bundler include the host module.

## ServerManager Responsibilities

- Early "starting" `.runtime.json` marker (so `list`/`info` show progress)
- Real TCP port probe loop (127.0.0.1) instead of naive increment (fixed collision bugs)
- HTTP `/health` wait (more reliable than file write alone)
- Child stdio piping to logger
- `treeKill` + `ps-list` for cross-platform stop + liveness (Windows has no reliable signals)
- Final authoritative `.runtime.json` written only after health passes

## Host (startHostedServer)

- Loads RAG first
- Registers the three tools (with `as any` casts required by current SDK version)
- Hono app:
  - `GET /health` (public, reports chunks status)
  - `use('/mcp', authMw)` — Bearer or X-MCP-Key; must be **before** route registration
  - `all('/mcp', transport.handleRequest)`
- Writes `.runtime.json` (pid, port, startedAt)
- SIGTERM/SIGINT handlers remove the runtime file

## Why the Arg-Based Guard?

Checking `process.argv.includes('--slug') && ...` (all four) is the only signal that works reliably across:
- Direct `tsx` invocation
- `node --import tsx`
- Packaged binary `__internal-host` self-spawn
- Manual debugging

It guarantees the main CLI entry never accidentally becomes an MCP host.

## See Also

- `src/process/manager.ts`
- `src/mcp/host.ts` (the if-guard + parse + startHostedServer)
- [Configuration - Paths](../configuration/paths-and-data)
- [Contributing - Testing](../contributing/testing) (how to test the spawn paths)
