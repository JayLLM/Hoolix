# ADR-0002: Pure-Node TUI

**Date**: 2026-06-04  
**Status**: Accepted

## Context
The default no-argument experience must work from a compiled Bun binary without making every non-TUI command pay startup or bundle cost. Earlier docs mentioned Ink/React, but the implemented dashboard is a lightweight raw-mode TUI.

## Decision
Keep `src/tui/index.tsx` as a dynamically imported pure-Node TUI with TTY/raw-mode guards and a deterministic test mode. Add better first-run guidance for empty registries instead of introducing a heavy TUI dependency.

## Consequences
Positive: small dependency footprint, fast CLI startup, reliable binary behavior, and a testable TUI path. Negative: layout richness is lower than an Ink app. Mitigation: only revisit Ink/React with a new ADR that measures binary size, startup cost, and Windows behavior.

## References
`src/index.ts`, `src/tui/index.tsx`, `MCP_PORTAL_TUI_TEST_MODE`.
