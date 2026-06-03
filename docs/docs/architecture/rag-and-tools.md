---
sidebar_label: RAG and MCP Tools
sidebar_position: 3
---

# RAG and MCP Tools

## DocumentationRAG (Fuse.js default + optional advanced hybrid)

`DocumentationRAG` (`src/rag/store.ts`) is the RAG implementation. See the dedicated [Advanced Hybrid RAG guide](../guides/advanced-rag) for reranking (RRF), caching, evaluation, and model choices.

- **Default ("fuse")**: `chunks.json` + Fuse.js (weighted on content/title/sectionPath) + scored keyword matching with phrase, title, section, URL, term coverage, and weak-query penalties. Zero native deps. Extremely bundle-friendly.
- **Optional hybrid** (`hybrid-bge-small` / `hybrid-bge-base`): lazy `@huggingface/transformers` + BGE. Vectors persisted in `embeddings.json`.
  - Smart embed cache hit detection on reindex.
  - In-memory LRU query vector cache at runtime.
  - Configurable fusion: `alpha` weighted blend or `reranker: 'rrf'` (often better relevance).
- **All paths** return results with `metadata.url` + `sectionPath` (the grounding contract — every tool response includes "Source: ...").
- `getTableOfContents` from stored sectionPaths, preserving source insertion order.
- `getDiagnostics` reports source coverage, unique URLs, total/average chars, duplicate chunk IDs, and ordering metadata for `verify`.
- Mode (`keyword` | `semantic` | `hybrid`) respected in `search_documentation`.

See `create --hybrid` / `--embedding-model`, `reindex`, `verify --eval`, `examples/benchmark.ts`, config `preferredEmbedding`.

No LanceDB or always-on heavy models (per AGENTS.md).

## The Three MCP Tools

All tools are registered via the official `@modelcontextprotocol/server` `McpServer` and exposed over Streamable HTTP.

### search_documentation

```json
{
  "query": "string (min 2 chars)",
  "limit": "1-20 (default 8)",
  "mode": "semantic | keyword | hybrid (default hybrid)"
}
```

Returns formatted passages with title/section + full content snippet + `Source: <url>` on every hit.

### read_documentation_page

```json
{
  "urlOrPath": "string (url or fragment)",
  "maxChunks": "1-30 (default 15)"
}
```

Matches chunks whose `url` or `sectionPath` contains the fragment. Concatenates them with `---` separators. Returns title + url + content.

### get_table_of_contents

No args. Walks all chunks, builds unique `sectionPath` entries with levels derived from `>` count. Preserves source order.

## Grounding Contract

Every piece of content returned to the MCP client contains an explicit `Source: https://...` line. Clients and LLMs are expected to use these for citation.

## See Also

- [API Reference - RAG](../api-reference/rag)
- [Guides: Authentication](../guides/authentication) (auth happens before tools)
- Implementation: `src/rag/store.ts` + `src/mcp/host.ts` (registerTool calls)
