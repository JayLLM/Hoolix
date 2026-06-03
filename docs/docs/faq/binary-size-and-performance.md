---
sidebar_label: Binary Size & Performance
sidebar_position: 4
---

# Binary Size and Performance

## Current Size (~95 MB on Windows after minify)

Achieved by:
- `--minify` on `bun build --compile`
- Lazy `createRequire` for `jsdom` + `@mozilla/readability` + transitive `css-tree` (only loaded for actual HTML pages)
- Removal of unused dev-time packages (ora, ink, react) from the production bundle
- Tree-shaking friendly structure (no top-level heavy imports in index for host paths)

## Performance Characteristics

- **Ingestion**: 10–120 s for real multi-page or full.txt sites (network bound + small amount of HTML parsing when needed). Progress is reported.
- **RAG search**: sub-millisecond (direct keyword + tiny Fuse index). No model loading.
- **Start**: usually < 1 s once the binary is warm (health probe waits up to 15 s worst case).
- **Memory**: very low — just the chunks.json in RAM + Fuse structures.

## Trade-offs

- Default RAG (Fuse.js) is deliberately zero-dep and instant for excellent binary size + startup.
- Optional hybrid (BGE via `@huggingface/transformers`, lazy) adds (see [Advanced Hybrid RAG](../guides/advanced-rag) for details):
  - First hybrid use on any server: model download (small ~30-50 MB, base ~80-120 MB to HF cache, once).
  - Indexing: smart cache hit if content unchanged (skips re-embed). Otherwise +20-80% time.
  - Search: +5-40 ms typical (query embed + cosine or RRF). Query embed cache makes repeated queries near-zero cost.
  - RRF reranker and `alpha` give better relevance than basic blend.
- TUI is now pure Node (no React/Ink) — even smaller.
- Current exe ~95-110 MB (acceptable). Strict lazy loading + models only on opt-in hybrid paths. Binary size discipline documented in AGENTS.md.

See AGENTS.md "binary-size discipline". Future: optional feature packs or external model cache.

## See Also

- [Architecture: RAG](../architecture/rag-and-tools)
- [Contributing: binary testing](../contributing/testing)
- `src/ingestion/cleaners.ts` (the require comment)
