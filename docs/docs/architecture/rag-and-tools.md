---
sidebar_label: RAG and MCP Tools
sidebar_position: 3
---

# RAG and MCP Tools

Hoolix retrieval is built around one contract: every useful answer should be grounded in a source URL.

## Retrieval Modes

- **Keyword/Fuse default**: lightweight, fast, no native dependencies, good for docs with clear terms.
- **Hybrid optional**: lazy semantic embeddings plus keyword retrieval and RRF-style fusion when enabled with `--hybrid` or `--embedding-model`.

Hybrid data is stored only for servers that use it. The default hot path stays small.

## Source-Aware Results

Chunks preserve:

- URL
- title
- section path
- heading hierarchy
- source ID
- source type
- source label

This lets multi-source servers answer from combined knowledge without hiding provenance.

## MCP Tools

All tools are available through Streamable HTTP hosts and stdio configs.

### search_documentation

```json
{
  "query": "authentication",
  "limit": 8,
  "mode": "hybrid",
  "maxTokens": 1800,
  "contextWindowTokens": 12000
}
```

Returns ranked passages with source URLs and source labels. Token budgeting options help clients request smaller or larger context safely.

### read_documentation_page

```json
{
  "urlOrPath": "installation",
  "maxChunks": 15
}
```

Reads matching chunks by URL, title, or path fragment.

### get_table_of_contents

Returns source-aware outline entries derived from chunk section paths.

## Verify Uses The Same RAG

```bash
hoolix verify <slug>
```

`verify` loads the same local index that MCP tools use. It checks sample searches, grounding, source coverage, diagnostics, and optional hybrid evaluation.

## Analytics

MCP tool calls feed audit logs and usage stats:

```bash
hoolix audit <slug>
hoolix stats <slug>
```

Stats help you see what agents ask for and which pages are most useful.

## See Also

- [RAG API Reference](../api-reference/rag)
- [MCP Host](../api-reference/mcp-host)
- [Advanced RAG](../guides/advanced-rag)
