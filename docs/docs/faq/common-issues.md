---
sidebar_label: Common Issues
sidebar_position: 1
---

# FAQ & Troubleshooting

## "chunks.json missing" or RAG returns no results

**Cause**: Registry `chunkCount` > 0 but `data/chunks.json` absent or empty (partial create, manual deletion, failed reindex).

**Fix**:

```bash
hoolix reindex <slug> --yes
```

## Port already in use / "health check did not succeed"

The port probe tries a 200-port range. If it still collides, another process grabbed it between probe and bind, or a previous `.runtime.json` is stale.

**Fix**:
- `hoolix stop <slug>`
- Kill leftover processes if needed
- Or specify `--port 4000` on start

## Auth fails even with the printed key

- Make sure you copied the **full** `mcp_...` value.
- Header must be `Authorization: Bearer <key>` (some clients lowercase "bearer" — the middleware accepts it).
- Try `X-MCP-Key` as fallback.
- Restart the client after config change.

## Binary won't start on Windows after build

Most common historical cause: static import of `jsdom` / css-tree at top level pulled in `data/patch.json` that isn't present in the compiled tree.

**Fix applied**: `htmlToMarkdown` now uses `createRequire` lazily inside the function. Rebuild with current source.

Also confirm you used `bun build --compile --minify`.

## "No llms.txt found" on a site that clearly has one in browser

Some sites return 404 or empty to default `node-fetch` UA but succeed for curl / real browsers.

hoolix rotates a few UAs + sends `Accept: text/markdown` during discovery. If it still fails, file an issue with the exact URL and `hoolix doctor` output.

## See Also

- [Windows Specific](./windows-specific)
- [Fetch & Protection](./fetch-and-protection)
- [Binary Size](./binary-size-and-performance)
- [verify command](../guides/reindexing-and-verify)
