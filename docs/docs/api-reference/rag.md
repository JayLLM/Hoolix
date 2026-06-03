---
sidebar_label: RAG
sidebar_position: 4
---

# RAG API Reference

## Types (`src/rag/types.ts`)

```ts
export interface SearchResult {
  content: string;
  score: number;
  metadata: { url: string; title: string; sectionPath?: string; headings?: string[]; charCount: number };
  citationId?: string;
}

export interface ReadPageResult {
  url: string;
  title: string;
  content: string; // concatenated
  chunks: Array<{ content: string; sectionPath?: string }>;
}

export interface TableOfContentsItem {
  title: string;
  level: number;
  url?: string;
  sectionPath?: string;
}

export interface RAGSearchOptions {
  limit?: number;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  filterUrl?: string;
}
```

## DocumentationRAG (`src/rag/store.ts`)

```ts
export class DocumentationRAG {
  constructor(slug: string);
  async initialize(): Promise<void>;
  async indexChunks(chunks: IngestedChunk[]): Promise<number>;
  async search(query: string, opts?: RAGSearchOptions): Promise<SearchResult[]>;
  async readPage(urlOrPath: string, maxChunks?: number): Promise<ReadPageResult | null>;
  async getTableOfContents(): Promise<TableOfContentsItem[]>;
  async close(): Promise<void>; // no-op for file backend
}

export async function createRAGForServer(slug: string): Promise<DocumentationRAG>;
```

`createRAGForServer` is the only public factory used by the CLI, the MCP host, and `test/verify-mcp.ts`.

## Behavior Notes

- `search` always tries a cheap direct keyword filter first across the three fields; only falls back to Fuse when that yields zero hits.
- `readPage` matches on url substring or sectionPath substring.
- All results preserve the original `metadata.url` from the chunk (the real page, never the manifest root).
- TOC is derived purely from `sectionPath` strings; no separate outline parsing at ingest time.

## Usage in MCP Host

The three `registerTool` calls in `host.ts` call exactly these methods and format the text responses with explicit `Source:` lines.

## See Also

- [Architecture: RAG and Tools](../architecture/rag-and-tools)
- [API: MCP Host](./mcp-host)
- Tests: `test/rag-store.test.ts`
