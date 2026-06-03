# ADR-0001: Web GUI Bundled Assets

**Date**: 2026-06-04  
**Status**: Accepted

## Context
The Web GUI originally lived in one large `server.ts` string and loaded Tailwind, Font Awesome, and fonts from CDNs. That weakened the binary "just works" promise because local GUI usability depended on network access and mixed server routing with presentation assets.

## Decision
Split the dashboard HTML builder into `src/web/assets.ts` and bundle a compact local CSS utility layer directly in the asset module. The Hono server stays responsible for routes, auth, and lifecycle APIs; assets stay responsible for HTML/CSS/client-side JavaScript.

## Consequences
Positive: the compiled binary can serve the GUI without CDN access, `server.ts` is smaller, and future GUI iteration has a clearer boundary. Negative: the bundled CSS is hand-maintained for now. Mitigation: keep the GUI beta-scoped and move to a build step only if the GUI grows beyond the current dashboard/playground surface.

## References
`src/web/server.ts`, `src/web/assets.ts`, `hoolix gui`.
