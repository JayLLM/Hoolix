---
sidebar_label: Ingestion Pipeline
sidebar_position: 2
---

# Ingestion Pipeline

The ingestion system is one of the highest-value parts of hoolix. It is designed to produce high-quality, grounded chunks with minimal user effort.

## Stages (Observable via Progress Callbacks)

1. **Detect** — Heuristic source type (llms.txt vs github vs generic) using URL + content signals.
2. **Fetch** — `fetchDocumentation` prefers `llms-full.txt` when input ends in `llms.txt`. For root calls it also performs discovery of `/llms-full.txt`, `/llms.txt`, `/docs/...` variants.
3. **Manifest Expansion** (only when primary looks like a TOC manifest) — `parseLlmsManifestUrls` extracts markdown links + bare https lines, dedupes, strips assets/anchors/llms files themselves, then `fetchPagesConcurrently` (3-4 workers) fetches each with `discoverLlms: false`.
4. **Clean** — HTML paths go through lazy-loaded `jsdom` + Readability + Turndown (see [cleaners.ts](https://github.com/JayLLM/hoolix/blob/main/src/ingestion/cleaners.ts) for the `createRequire` rationale that protects binary size). Markdown/llms paths use light `normalizeMarkdown`.
5. **Chunk** — `chunkMarkdown` walks headings, maintains a stack for `sectionPath` (e.g. "Getting Started > Installation"), produces overlap from previous chunk tail, splits oversized blocks, and attaches per-chunk `url`, `title`, `headings`, `order`.
6. **Cap & Emit** — Global `maxChunks` (default 6000 in CLI) and per-page early exit. Final `done` message distinguishes `llms-full.txt (concatenated documentation)` vs "N page(s)".

## Why Per-Page Chunking Matters

Each chunk's `metadata.url` is the **actual page URL**, not the root manifest. This guarantees that `search_documentation` and `read_documentation_page` return correct `Source:` lines for grounding in LLM responses.

## Protection & Resilience

- UA rotation + explicit `Accept: text/markdown` only during discovery (some sites 404 plain node fetch but serve curl/browser).
- Retries with backoff + curl fallback in `fetchWithRetry`/`fetchTextWithFallback`.
- GitHub special path (new in 0.0.2): raw + optional tree API (GITHUB_TOKEN) + .gitignore-aware discovery for READMEs/docs/llms. **Full GITHUB_TOKEN threading to raw.githubusercontent fetches for true private repo support** (API + raw + .gitignore + expansion pages). Always graceful fallback with actionable hints. See [Creating Servers](../guides/creating-servers#private-github-repos).
- Sub-page fetches explicitly disable discovery to prevent metadata corruption.

## Output Types

See `IngestionResult` and `IngestedChunk` in [API Reference](../api-reference/ingestion).

## See Also

- [RAG and MCP Tools](./rag-and-tools)
- [Guides: Multi-page llms](../guides/multi-page-llms)
- Source: [pipeline, fetchers, chunker, cleaners](https://github.com/JayLLM/hoolix/tree/main/src/ingestion) on GitHub
