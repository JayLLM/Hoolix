---
sidebar_label: Advanced Hybrid RAG
sidebar_position: 5
---

# Advanced Hybrid RAG (Reranking, Caching, Evaluation, Better Models)

hoolix's RAG is deliberately lightweight by default (Fuse.js + direct keyword). For higher relevance on complex documentation you can opt into **hybrid** semantic search powered by BGE models (via `@huggingface/transformers`, lazy-loaded).

This guide covers the **advanced** features added for production agent use.

## Enabling Hybrid

```bash
hoolix create "My Docs" --url https://.../llms-full.txt --yes --hybrid
# or a stronger model
hoolix reindex my-docs --embedding-model hybrid-bge-base --yes
```

- `--hybrid` → `hybrid-bge-small` (384-dim, fast, ~30-50 MB first download)
- `--embedding-model hybrid-bge-base` → larger/better (768-dim)
- Respects `preferredEmbedding` in `~/.hoolix/config.json`
- Once indexed, the server metadata records `embeddingModel` + `vectorIndexed`

Fuse keyword is **always** available and used as a strong fallback / blend component.

## How Hybrid Works (v2+)

1. **Keyword side**: direct contains fast-path + Fuse.js (weighted on content/title/sectionPath).
2. **Semantic side**: BGE bi-encoder produces a query vector (with official instruction prefix) and cosine-similarity against passage vectors stored in `embeddings.json`.
3. **Fusion** (the smart part):
   - Default: **weighted blend** (`alpha * semantic + (1-alpha) * keyword`). `alpha` defaults to 0.7 for hybrid.
   - Advanced: **RRF (Reciprocal Rank Fusion)** — `reranker: 'rrf'` in search options. Often superior for hybrid because it uses rank positions rather than raw scores.
4. **Caches**:
   - **Persistent embeddings**: `embeddings.json` (per-server, invalidated on reindex).
   - **Smart embed cache hit**: On reindex, if chunk count + ids match existing vectors we skip the forward pass entirely (huge win when source hasn't changed).
   - **Runtime query cache**: LRU (128) of embedded queries inside the running host. Repeated agent queries are near-instant after first.

All paths still obey the **grounding contract** — every result has `metadata.url` + `sectionPath`.

## Using Advanced Options

The MCP `search_documentation` tool accepts `mode`. For deeper tuning use the CLI tools:

```bash
# Basic
hoolix verify my-docs

# With automatic eval proxy (latency + term-hit + grounding + mode comparison)
hoolix verify my-docs --eval

# Standalone benchmark (supports --eval --json --reranker rrf --mode ...)
node --import tsx examples/benchmark.ts --slug my-docs --eval --json
```

Programmatic (in your own scripts or future plugins):

```ts
const rag = await createRAGForServer(slug, 'hybrid-bge-base');
const hits = await rag.search('how do I rotate keys?', {
  limit: 6,
  mode: 'hybrid',
  alpha: 0.75,        // more semantic
  reranker: 'rrf',
  rrfK: 60,
});
```

## Choosing a Model

| Model                | Dim | When to use                     | First-run cost          |
|----------------------|-----|---------------------------------|-------------------------|
| `fuse` (default)     | —   | Most cases, tiny binary, instant | None                    |
| `hybrid-bge-small`   | 384 | Good relevance / speed balance  | ~30-50 MB download      |
| `hybrid-bge-base`    | 768 | Higher quality (recommended for large/complex docs) | ~80-120 MB download   |

Larger models increase:
- First indexing time
- HF cache size on disk
- (Slightly) search latency on CPU-only

The binary itself grows only by the size of the transformers dep (already accounted for when you first use any hybrid).

## Eval & Benchmarking

- `verify --eval` — quick in-CLI proxy (no golden set required).
- `examples/benchmark.ts` — more queries, json output, explicit mode/rrf comparison. Extend it with your own golden queries + expected URLs for real regression testing.

Example golden pattern (add to the benchmark script):

```ts
const goldens = [
  { q: 'how to rotate the key', expectUrlContains: 'rotate' },
];
```

## Graceful Degradation

If the model fails to load (network, disk, unsupported runtime):
- Server still works 100% via Fuse/keyword.
- `verify` / `doctor` surface clear warnings.
- Reindex with `--embedding-model fuse` (or just omit) to drop back to pure keyword.

## Performance Notes

See [FAQ: Binary Size & Performance](../faq/binary-size-and-performance) for measured impact.

Typical numbers (small docs, modern laptop CPU):
- Index hybrid small: +20-80% wall time (mostly one-time model load)
- Search hybrid: +5-30 ms (query embed + cosine over a few thousand vectors). RRF is negligible.
- With query cache hot: near zero extra cost.

## Best Practices (for Agents & Teams)

- Start with `fuse`. Add hybrid only when you see relevance complaints in `verify`.
- Use `--embedding-model hybrid-bge-base` for docs > ~2000 chunks or highly technical content.
- After major source changes, `reindex` (cache hit will help if content is similar).
- Monitor with `hoolix audit <slug>` (search calls) + the benchmark script.
- For production hosted servers, pin a model and pre-warm the HF cache in your image.

## See Also

- [Architecture: RAG and Tools](../architecture/rag-and-tools)
- [Creating Servers](../guides/creating-servers)
- `src/rag/{store.ts,models.ts,types.ts}`
- AGENTS.md (RAG section)

The implementation is intentionally **not** using heavy vector DBs (LanceDB etc.) in the default path — everything stays bundle-friendly and "just works" after `bun install` or the binary.
