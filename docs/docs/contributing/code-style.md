---
sidebar_label: Code Style
sidebar_position: 2
---

# Code Style & Standards

- **TypeScript strict** — explicit types, no implicit any. Prefer interfaces over type aliases for public shapes.
- **Zod for all external/persisted data** — registry, config, HostOptions, etc.
- **Errors** — use the `MCPPError` hierarchy from `src/core/errors.ts`. Never `throw 'string'` or vague `new Error`.
- **Logging** — `import { logger } from './core/logger.js'` (consola). No `console.log` in library code.
- **Imports** — relative imports must end with `.js` (ESM requirement even for .ts source).
- **No top-level heavy await** — hurts binary startup time.
- **Side-effect free where possible** — especially in hot modules.
- **Windows first** — test path logic, spawn, kill, and port selection on Windows early.

## Comments (from this documentation task)

- Remove outdated, redundant ("what" the code already says), or vague comments.
- Keep comments that explain **why**, complex algorithms, non-obvious side effects, gotchas, and important invariants.
- The RAG choice (Fuse vs Lance) and the lazy jsdom require in cleaners are canonical examples of comments worth keeping.

## See Also

- [AGENTS.md](https://github.com/JayLLM/hoolix/blob/main/AGENTS.md)
- [Contributing: PRs](./pull-requests)
