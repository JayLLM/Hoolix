---
sidebar_label: Ingestion Pipeline
sidebar_position: 2
---

# Ingestion Pipeline

The ingestion pipeline turns source definitions into grounded chunks. It is designed for reliable agent answers: every useful result should include a source URL, section context, and source provenance.

## Inputs

Hoolix can ingest:

- `llms.txt` and `llms-full.txt`
- GitHub repositories
- Regular documentation pages
- Raw Markdown or text
- Private sources with headers or cookies
- Custom source plugin outputs
- Multi-source server definitions
- Template-backed server definitions

Legacy `--url` servers are migrated into a single-source definition when loaded.

## Stages

1. **Validate** — Server and source definitions are validated with Zod.
2. **Resolve** — Templates and custom source plugin manifests are expanded into concrete sources.
3. **Detect** — Source type is detected from source syntax, URL, and content signals.
4. **Fetch** — Hoolix fetches content with request auth, retries, user-agent rotation, and GitHub-specific paths.
5. **Discover** — `llms-full.txt`, `llms.txt`, manifests, READMEs, docs folders, and GitHub trees are discovered where possible.
6. **Clean** — Markdown is normalized; HTML uses lazy-loaded readability tooling.
7. **Chunk** — Heading-aware chunking preserves `sectionPath`, headings, order, title, and URL.
8. **Annotate** — Chunks receive source provenance such as `sourceId`, `sourceType`, and `sourceLabel`.
9. **Index** — Fuse.js keyword index is built by default; optional hybrid embeddings are built only when enabled.
10. **Persist** — Chunks, metadata, source fingerprints, schedules, and ingestion stats are stored.

## Why Source Provenance Matters

Multi-source servers combine docs, GitHub repos, and internal content. Provenance keeps results explainable:

- `metadata.url` tells the client where the content came from.
- `sourceType` distinguishes docs, GitHub, web, llms, and custom sources.
- `sourceLabel` helps TUI, GUI, verify, and stats display readable source names.

This makes a composed server feel coherent without hiding where each answer came from.

## Private Sources

`--header` and `--cookie` are stored in the server definition for future reindexing. GitHub repositories can use `GITHUB_TOKEN` for API tree discovery and raw content fetches.

When exporting for teams, use `--team --strip-key`. Include private source auth only with `--include-source-auth` and only for trusted destinations.

## Incremental Reindexing

Hoolix stores source fingerprints where available. Reindex can skip unchanged sources, force a full refresh, or run all due schedules:

```bash
hoolix reindex my-docs --yes
hoolix reindex my-docs --force --yes
hoolix reindex --due --json
```

## Protection And Resilience

- User-agent rotation and retry backoff.
- Curl fallback for difficult fetches.
- GitHub-aware raw and tree discovery.
- Token-aware private GitHub support.
- Source health surfaced in `doctor` and `verify`.
- Progress events shared by CLI, TUI, and GUI.

## See Also

- [Creating Servers](../guides/creating-servers)
- [API Reference: Ingestion](../api-reference/ingestion)
- [RAG and MCP Tools](./rag-and-tools)
