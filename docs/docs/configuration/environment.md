---
sidebar_label: Environment
sidebar_position: 1
---

# Environment Variables

Most Hoolix behavior is configured through commands and persisted server definitions. These environment variables are useful for development, automation, private sources, and host tuning.

| Variable | Effect |
| --- | --- |
| `MCP_PORTAL_DATA_DIR` | Override the Hoolix data directory. Useful for tests and isolated demos. |
| `MCP_PORTAL_LOG_LEVEL=debug` | Increase logger verbosity. |
| `MCP_PORTAL_SKIP_UPDATE_CHECK=1` | Disable background update checks. |
| `MCP_TOOL_TIMEOUT_MS` | Override MCP tool timeout; default is `15000`. |
| `MCP_RATE_LIMIT` | HTTP host request limit per rate window; default is `120`. |
| `MCP_RATE_WINDOW_SEC` | HTTP rate window in seconds; default is `60`. |
| `GITHUB_TOKEN` / `GH_TOKEN` | Enable private GitHub access and higher GitHub API limits. |
| `HOOLIX_SOURCE_PLUGIN_DIR` | Add a directory of custom source plugin manifests. |

Internal test variables such as `MCP_PORTAL_TUI_TEST_MODE` and `MCP_PORTAL_TUI_KEYS` are used by the e2e suite.

## Private Sources

Prefer CLI flags for source-specific credentials:

```bash
hoolix create "Private Docs" \
  --url https://docs.example.com/llms.txt \
  --header "Authorization: Bearer $DOCS_TOKEN" \
  --cookie "session=$DOCS_SESSION" \
  --yes
```

Use environment variables for GitHub tokens because they are shared by GitHub API and raw-content fetches:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

## Build / Release Time

- `bun build --compile --minify` produces native binaries.
- Release automation uses `release-it`.
- `scripts/sync-version.cjs` syncs `src/core/version.ts` from `package.json`.

## See Also

- [Paths and Data](./paths-and-data)
- [Registry and Validation](./registry-and-validation)
- [Fetch and Protection Issues](../faq/fetch-and-protection)
