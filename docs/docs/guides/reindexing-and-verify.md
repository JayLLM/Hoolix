---
sidebar_label: Reindexing and Verify
sidebar_position: 2
---

# Reindexing and Verify

`verify` tells you whether a server is useful. `reindex` keeps it useful as sources change.

## Verify First

```bash
hoolix verify my-docs
```

`verify` loads the same RAG index used by MCP tools and checks:

- Server metadata and definition validity.
- Chunk count and file consistency.
- Source provenance and grounding URL coverage.
- Sample searches and weak-query signals.
- Table of contents reconstruction.
- Hybrid mode health when enabled.

Use it before connecting a client, after reindexing, and whenever users report poor answers.

## Interpreting Verify Output

| Signal | Meaning |
| --- | --- |
| Empty chunks | Reindex or choose a better source URL |
| Low grounding | Some chunks lack source URLs; inspect ingestion output |
| Weak sample queries | Try a more specific source or enable hybrid search |
| Source warnings | Check private auth, GitHub token, headers, cookies, or source plugin config |
| Stale freshness | Reindex manually or configure a schedule |

## Manual Reindex

```bash
hoolix reindex my-docs --yes
```

Reindex preserves the slug and auth key. It refreshes sources, chunks, source health, fingerprints, ingestion stats, and the RAG index.

## Incremental Reindex

Incremental behavior is enabled by default where fingerprints are available. Hoolix can skip unchanged sources and rebuild only when needed.

```bash
hoolix reindex my-docs --yes
```

Force a full refresh:

```bash
hoolix reindex my-docs --force --yes
```

Disable incremental skipping for one run:

```bash
hoolix reindex my-docs --no-incremental --yes
```

## Scheduled Reindex Metadata

Store a schedule on a server:

```bash
hoolix reindex my-docs --schedule daily --yes
```

Run all servers whose schedule is due:

```bash
hoolix reindex --due --json
```

Hoolix records the schedule and due state locally. Use your system scheduler, CI, or a team automation runner to call `hoolix reindex --due`.

## Private Source Reindexing

Private headers, cookies, and GitHub token needs apply during reindex too.

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
hoolix reindex private-repo-docs --yes
```

If source auth fails, run:

```bash
hoolix doctor
hoolix verify private-repo-docs
```

## JSON For CI

```bash
hoolix verify my-docs --json
hoolix reindex --due --json
```

Use JSON output to gate release workflows, nightly refreshes, or internal quality checks.

## See Also

- [Creating Servers](./creating-servers)
- [CLI Reference](../api-reference/cli)
- [RAG and Tools](../architecture/rag-and-tools)
