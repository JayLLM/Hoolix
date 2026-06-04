---
sidebar_label: RAG
sidebar_position: 4
---

# RAG API Reference

Hoolix uses fast Fuse.js + keyword retrieval by default and optional lazy hybrid semantic search when enabled.

## SearchResult

```ts
export interface SearchResult {
  content: string;
  score: number;
  metadata: {
    url: string;
    title: string;
    sectionPath?: string;
    headings?: string[];
    charCount: number;
    sourceId?: string;
    sourceType?: string;
    sourceLabel?: string;
  };
  citationId?: string;
}
```

## Search Options

```ts
export interface RAGSearchOptions {
  limit?: number;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  filterUrl?: string;
  maxTokens?: number;
  contextWindowTokens?: number;
}
```

Token-aware options let clients ask for appropriately sized context. Hoolix trims result content while preserving source URLs.

## ReadPageResult

```ts
export interface ReadPageResult {
  url: string;
  title: string;
  content: string;
  chunks: Array<{
    content: string;
    sectionPath?: string;
  }>;
}
```

## TableOfContentsItem

```ts
export interface TableOfContentsItem {
  title: string;
  level: number;
  url?: string;
  sectionPath?: string;
  order?: number;
  sourceId?: string;
  sourceType?: string;
  sourceLabel?: string;
}
```

## DocumentationRAG

```ts
export class DocumentationRAG {
  constructor(slug: string);
  async initialize(): Promise<void>;
  async indexChunks(chunks: IngestedChunk[]): Promise<number>;
  async search(query: string, opts?: RAGSearchOptions): Promise<SearchResult[]>;
  async readPage(urlOrPath: string, maxChunks?: number): Promise<ReadPageResult | null>;
  async getTableOfContents(): Promise<TableOfContentsItem[]>;
  async getDiagnostics(): Promise<RAGDiagnostics>;
  async close(): Promise<void>;
}
```

`createRAGForServer(slug)` is the public factory used by services, CLI commands, TUI, GUI, and MCP hosts.

## Behavior Notes

- Default search combines direct keyword scoring and Fuse fuzzy search.
- Hybrid search adds embedding-backed retrieval and RRF fusion when configured.
- Search/read/TOC preserve `metadata.url`.
- Multi-source chunks preserve source provenance.
- TOC is derived from chunk section paths in source order.
- Diagnostics power `verify`.

## MCP Tools

The MCP host exposes:

- `search_documentation`
- `read_documentation_page`
- `get_table_of_contents`

All tool responses include source URLs. Search supports token budgeting inputs.

## See Also

- [Architecture: RAG and Tools](../architecture/rag-and-tools)
- [MCP Host](./mcp-host)
- [Reindexing and Verify](../guides/reindexing-and-verify)
