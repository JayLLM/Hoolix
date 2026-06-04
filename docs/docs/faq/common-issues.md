---
sidebar_label: Common Issues
sidebar_position: 1
---

# FAQ And Troubleshooting

## The TUI Did Not Open

The TUI requires an interactive terminal. In CI, pipes, or terminals without raw-mode support, Hoolix prints CLI help instead.

Use CLI commands directly:

```bash
hoolix trial
hoolix list
hoolix gui
```

## `chunks.json missing` Or Empty Results

The registry exists but the index data is missing or empty.

```bash
hoolix verify <slug>
hoolix reindex <slug> --yes
```

## Port Already In Use

```bash
hoolix stop <slug>
hoolix start <slug> --port 4000
```

If needed, run `hoolix doctor` to inspect process and runtime state.

## Auth Fails

- Copy the full `mcp_...` key.
- Use `Authorization: Bearer <key>` or `X-MCP-Key: <key>`.
- Restart the MCP client after config changes.
- Re-run `hoolix connect <slug> --client <name>`.
- If you rotated the key, restart the server.

## Private Source Fetch Fails

Use headers, cookies, or GitHub token access:

```bash
hoolix create "Private Docs" --url https://docs.example.com/llms.txt --header "Authorization: Bearer $TOKEN" --yes
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

Then force a refresh:

```bash
hoolix reindex <slug> --force --yes
```

## Stdio Client Config Does Not Work

Generate the config again and use the JSON exactly:

```bash
hoolix start <slug> --transport stdio --json
```

For HTTP clients, use:

```bash
hoolix start <slug>
hoolix connect <slug> --client generic --json
```

## Scheduled Reindex Did Not Run

Schedules are local metadata. You still need a scheduler or automation runner to call:

```bash
hoolix reindex --due --json
```

## Source Plugin Not Found

Run:

```bash
hoolix doctor
```

Then add a JSON manifest to the Hoolix `source-plugins` directory or set `HOOLIX_SOURCE_PLUGIN_DIR`.

## See Also

- [Fetch and Protection](./fetch-and-protection)
- [Windows Specific](./windows-specific)
- [Reindexing and Verify](../guides/reindexing-and-verify)
