---
sidebar_label: Multi-Page llms.txt
sidebar_position: 5
---

# Multi-Page llms.txt Support

hoolix has first-class support for two common documentation distribution patterns:

1. `llms-full.txt` — a single concatenated file (best).
2. `llms.txt` that is a manifest (list of links to individual pages).

## How Detection Works

In `pipeline.ts`:

```ts
const isLlmsManifest =
  fetched.url.includes('llms.txt') &&
  !fetched.url.includes('llms-full.txt') &&
  (has markdown links or bare URLs);
```

If true, `parseLlmsManifestUrls` + `fetchPagesConcurrently(..., discoverLlms: false)` expands it.

## The discoverLlms Guard (Important)

Sub-page fetches are called with `{ discoverLlms: false }`. Without this guard, a sub-page fetch could re-discover the root `llms.txt`, store the wrong `metadata.url` on every chunk, and produce duplicate root content.

## llms-full Reporting

Both `create` and `reindex` (and the progress `done` stage) specially detect `llms-full.txt` in the final `sourceUrl` and emit:

```
from llms-full.txt (concatenated documentation)
```

instead of "from 1 page(s)".

## Limits

- `maxPages: 80` (CLI default)
- `maxChunks: 6000` (CLI default)
- Truncation is logged as a warning.

## See Also

- [Ingestion Pipeline](../architecture/ingestion-pipeline)
- [fetchers.ts source](https://github.com/JayLLM/hoolix/blob/main/src/ingestion/fetchers.ts) (the guard + UA rotation)
- [Creating Servers](./creating-servers)
