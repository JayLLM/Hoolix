---
sidebar_label: Development Setup
sidebar_position: 1
---

# Development Setup

## Prerequisites

- Bun (strongly preferred) 1.2+
- Node 20+ as fallback
- Git

## Clone & Install

```bash
git clone https://github.com/JayLLM/hoolix.git
cd hoolix
bun install
```

## Common Dev Commands

```bash
bun run dev                    # or npx tsx src/index.ts
bun run dev -- create "Test" --url https://... --yes

bun test --run                 # vitest
npx tsc --noEmit -p tsconfig.json

bun run build                  # tsc to dist/
bun run build:binary:win       # produces dist-bin/hoolix.exe (your platform)
```

## Testing the Host Model

- Run `bun run dev start <slug>` (uses tsx path)
- Build a binary, then use the produced exe to `start` — exercises the `__internal-host` path
- Use `test/verify-mcp.ts` to exercise RAG without spawning

## Windows Notes

- Always test spawn on Windows (`.cmd` for tsx, ps-list, tree-kill, port probe)
- Use PowerShell for install script testing

## See Also

- [AGENTS.md](https://github.com/JayLLM/hoolix/blob/main/AGENTS.md) (read this first)
- [Code Style](./code-style)
- [Testing](./testing)
- [Pull Requests](./pull-requests)
