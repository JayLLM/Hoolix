---
sidebar_label: Reindexing and Verify
sidebar_position: 2
---

# Reindexing and Verify

## When to Reindex

- Upstream documentation has been updated.
- You suspect drift (`list` or `info` shows validation warnings).
- You changed the source URL externally and want to point the server at new content.

```bash
hoolix reindex <slug> --yes
```

Reindex keeps the same auth key and slug. Only `chunkCount`, `sourceType`, and the on-disk `chunks.json` change.

## The verify Command (Your Best Friend)

```bash
hoolix verify my-docs
```

It does **not** talk to a running host. It directly loads the RAG the same way the MCP tools will, runs representative searches, and shows you:

- Whether chunks are present and searchable
- Source coverage: how many chunks have grounding URLs and how many unique source URLs are represented
- Ingestion cap/truncation status from the last create/reindex
- Weak sample queries that returned no hits, ungrounded hits, or low scores
- Sample content + the all-important `Source: <url>` lines
- Reconstructed table of contents in source order

If the top results for "overview", "install", "api" contain relevant prose and correct source URLs, your server will be useful to agents.

## Interpreting Output

- `RAG searchable: no (empty index?)` → chunks.json missing or empty → run reindex.
- Validation issues in the first section → same.
- `Truncated: yes` → ingestion hit `maxChunks` or `maxPages`; prefer a narrower source URL or reindex once cap flags/config are available.
- Source coverage below 100% → some chunks are missing URLs; reindex and inspect ingestion output.
- `Needs attention` queries → check those terms manually, try a better source, or use hybrid mode for semantic recall.
- Good content but wrong Source URLs → you hit a bug in `discoverLlms` handling (rare after the guard was added).

## Programmatic Equivalent

See `test/verify-mcp.ts` — it does exactly what `verify` does but can be called from scripts or CI.

## See Also

- [CLI Reference - verify](../api-reference/cli)
- [FAQ: Drifted State](../faq/common-issues)
- [Architecture: RAG](../architecture/rag-and-tools)
