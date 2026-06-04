---
sidebar_label: Creating Servers
sidebar_position: 1
---

# Creating Servers

A Hoolix server is a portable MCP server definition plus indexed source content, auth, stats, and lifecycle state.

You can create servers from one URL, multiple sources, official templates, private docs, GitHub repositories, or custom source plugins.

## TUI First

```bash
hoolix
```

The TUI is the easiest starting point. It can launch a trial, copy create commands, start and stop servers, verify, connect clients, reindex, and show logs.

## Single-Source Servers

The original syntax stays fully supported:

```bash
hoolix create "React Docs" --url https://react.dev/llms.txt --yes
```

Use `--url` for:

- `llms.txt`
- `llms-full.txt`
- GitHub repository URLs
- Regular documentation pages
- Raw Markdown or text URLs

## Multi-Source Servers

Use repeated `--source` flags to combine related knowledge into one MCP server:

```bash
hoolix create "Frontend Stack" \
  --source docs:https://react.dev/llms.txt \
  --source github:vercel/next.js \
  --source web:https://nextjs.org/docs \
  --yes
```

Each source receives provenance metadata so search results can identify where they came from.

## Source Syntax

| Syntax | Use it for |
| --- | --- |
| `docs:<url>` | General documentation URLs |
| `llms:<url>` | Explicit `llms.txt` or `llms-full.txt` sources |
| `web:<url>` | Regular web pages |
| `github:<owner>/<repo>` | GitHub repositories |
| `custom:<provider>:<value>` | Source plugin manifests |

## Template-Backed Servers

Templates are curated server definitions for common MCP use cases.

```bash
hoolix templates list
hoolix templates info docs-rag
hoolix create "My Docs" --template docs-rag --url https://example.com/llms.txt --yes
```

Current official templates include docs RAG, GitHub docs, Terraform AWS docs, and Hoolix docs examples. Template IDs may grow over time; use `hoolix templates list` for the source of truth.

## Private Sources

Use request headers and cookies for authenticated documentation:

```bash
hoolix create "Private API" \
  --url https://docs.example.com/llms.txt \
  --header "Authorization: Bearer $DOCS_TOKEN" \
  --cookie "session=$DOCS_SESSION" \
  --yes
```

For private GitHub repositories:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
hoolix create "Private Repo Docs" --source github:org/private-repo --yes
```

Private source auth is stored in the server definition so reindex can use the same access. Team exports strip sensitive server keys by default when you use `--team --strip-key`; only include source auth in bundles when you explicitly trust the destination.

## Custom Source Plugins

Custom source plugins let teams map internal identifiers to Hoolix-supported source kinds.

```bash
hoolix create "Internal Handbook" --source custom:handbook:getting-started --yes
```

Plugin manifests are discovered from the Hoolix data directory or `HOOLIX_SOURCE_PLUGIN_DIR`. Run `hoolix doctor` to confirm discovery.

## Hybrid RAG

The default index is fast Fuse.js + keyword search. Enable optional hybrid semantic retrieval when you want embedding-backed search:

```bash
hoolix create "Deep Docs" --url https://example.com/llms.txt --hybrid --yes
```

Hybrid models are lazy-loaded and may download on first use. See [Advanced RAG](./advanced-rag).

## What Happens During Create

1. Hoolix validates the server and source definition with Zod.
2. Sources are fetched with progress events.
3. Content is cleaned, chunked, and tagged with source provenance.
4. The RAG index is built.
5. Metadata, definition, chunks, auth, and schedule settings are stored.
6. Hoolix prints the next useful commands.

## After Create

Always verify before wiring clients:

```bash
hoolix verify <slug>
```

Then start and connect:

```bash
hoolix start <slug>
hoolix connect <slug> --client cursor
```

## Maintenance

```bash
hoolix reindex <slug> --yes
hoolix reindex <slug> --schedule daily --yes
hoolix stats <slug>
hoolix export <slug> --team --strip-key --file server.hoolix.json
```

## See Also

- [Quick Start](../getting-started/quick-start)
- [CLI Reference](../api-reference/cli)
- [Reindexing and Verify](./reindexing-and-verify)
- [Authentication](./authentication)
