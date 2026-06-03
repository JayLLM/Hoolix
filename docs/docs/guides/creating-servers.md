---
sidebar_label: Creating Servers
sidebar_position: 1
---

# Creating Servers

## Interactive

```bash
hoolix create
# prompts for name and URL
```

## Non-Interactive (scripts / CI)

```bash
hoolix create "My Product Docs" \
  --url https://docs.example.com/llms-full.txt \
  --yes
```

GitHub repos are now first-class too:

```bash
hoolix create "Repo Docs" --url https://github.com/owner/repo --yes
# or a subdir: https://github.com/owner/repo/tree/main/docs
```

The `--yes` skips the confirmation prompt. The slug is derived via `slugify(name)` (lowercase, spaces/punct → `-`, max 64 chars).

GitHub paths prefer llms.txt / llms-full.txt + README.md + docs/ .md files (raw content), with richer discovery when `GITHUB_TOKEN` is set (tree API + .gitignore awareness). Falls back gracefully.

### Private GitHub Repos

For private repos (or higher rate limits), provide a `GITHUB_TOKEN`:

```bash
# Classic token (repo scope) or fine-grained with Contents:Read + Metadata:Read
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

hoolix create "Private Docs" --url https://github.com/org/private-repo --yes
```

- Token is used for both GitHub API (tree discovery) **and** raw content fetches (`raw.githubusercontent.com`).
- Never commit tokens; use env or your shell profile.
- The `hoolix doctor` and error messages surface guidance when auth fails on private sources.
- Re-run `hoolix reindex <slug>` after setting token if initial create used public path.

## What Happens

1. `ingestDocumentation` runs (progress updates the spinner).
2. RAG index is built (Fuse + direct keyword by default; add `--hybrid` or `--embedding-model hybrid-bge-base` or set `preferredEmbedding` in config for advanced hybrid with RRF reranking, query caching, etc.). See [Advanced Hybrid RAG](./advanced-rag).
3. Server is registered with a fresh cryptographically random `mcp_...` key (plus `embeddingModel` + `vectorIndexed` metadata).
4. You are shown the exact next command and a hint to run `verify`.

## Choosing a Good Source URL

- Prefer `llms-full.txt` when the site provides one (best RAG quality, single file, perfect hierarchy).
- A well-structured `llms.txt` that is actually a manifest of page links also works (multi-page mode).
- Generic docs sites without llms files fall back to a single-page fetch (still useful but less coverage).

## After Create

Always run:

```bash
hoolix verify <slug>
```

Then:

```bash
hoolix start <slug>
```

## See Also

- [Quick Start](../getting-started/quick-start)
- [Multi-page Guide](./multi-page-llms)
- [Reindexing](./reindexing-and-verify)
