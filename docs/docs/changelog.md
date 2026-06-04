---
sidebar_label: Changelog
sidebar_position: 99
---

# Changelog

The canonical changelog lives in the root repository:

- [CHANGELOG.md](https://github.com/JayLLM/hoolix/blob/main/CHANGELOG.md)
- [GitHub Releases](https://github.com/JayLLM/hoolix/releases)

Use the changelog to track released CLI flags, templates, transports, bundle formats, and documentation changes.

## Recent Highlights (beta series)

### Distribution & Installation
- **npm global package** (`npm install -g hoolix`) — provenance-verified via npm registry. Recommended install path.
- **SHA-256 checksums** attached to every GitHub Release; verified in `hoolix update` and install scripts.
- **Optional GPG `.asc` signatures** when `GPG_PRIVATE_KEY` secret is configured.
- **macOS x64 binary** (`hoolix-darwin-x64`) added to the release matrix.
- **Shell tab-completion** for bash, zsh, fish, and PowerShell via `hoolix completion <shell>`.

### Templates & MCP Servers
- **14 official templates**: `docs-rag`, `github-docs`, `filesystem`, `github-api`, `postgres`, `sqlite`, `memory`, `sequential-thinking`, `brave-search`, `slack`, `puppeteer`, `google-maps`, and more.
- **`hoolix install <template>`** — sugar for `create --template` with positional inputs and interactive credential prompts.
- **Two-kind template system** — `docs-rag` (indexes knowledge) and `mcp-server` (config-only, stdio or proxied).
- **Community templates** — drop `*.json` files into `~/.hoolix/templates/` for private or third-party templates.

### Proxy Mode
- **`hoolix start <slug> --proxy`** — wraps any stdio mcp-server behind authenticated Hono HTTP.
- Auto-restart with exponential backoff (up to 5 attempts), 30-second health monitoring.
- SSE event wrapping for clients that send `Accept: text/event-stream`.
- `hoolix list` shows `proxy:PORT` in the Status column.
- `hoolix doctor` reports which servers are running in proxy mode.

### Credentials & Secrets
- **`hoolix secrets set/list/remove`** — credential management stored separately from metadata (0600 `credentials.json`).
- Credentials are never exported in bundles; `bundle import` prints `hoolix secrets set` instructions.

### Multi-Server Bundles
- **`hoolix bundle export/import`** — export multiple servers into a single file and import on another machine.

### TUI & CLI
- mcp-server detail panel in TUI shows proxy URL and HTTP config hints when running in proxy mode.
- `hoolix list` renamed the "Chunks" column to "Status" for mcp-server kind servers.
- `hoolix doctor` reports install method (npm vs. binary vs. dev) and binary signing status.
- `hoolix update` verifies SHA-256 before applying the binary; `--no-verify` escape hatch.

## See Also

- [CLI Reference](./api-reference/cli)
- [Creating Servers](./guides/creating-servers)
- [Architecture Overview](./architecture/overview)
- [Installation](./getting-started/installation)
