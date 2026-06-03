---
sidebar_label: Ingestion
sidebar_position: 3
---

# Ingestion API Reference

## Types (`src/ingestion/types.ts`)

```ts
export type SourceType = 'llms.txt' | 'github' | 'generic' | 'manual';

export interface IngestedChunk {
  id: string;
  content: string;
  metadata: {
    url: string;           // critical for grounding
    title: string;
    sectionPath?: string;  // "Foo > Bar > Baz"
    headings?: string[];
    charCount: number;
    order: number;
  };
}

export interface IngestionResult {
  sourceUrl: string;
  sourceType: SourceType;
  title: string;
  chunks: IngestedChunk[];
  stats: { totalChunks: number; totalChars: number; pagesProcessed: number; durationMs: number };
  rawMarkdown?: string;
}

export interface IngestionProgress { stage: ...; message: string; current?: number; total?: number; }
export type ProgressCallback = (p: IngestionProgress) => void;

export interface IngestionOptions {
  maxPages?: number;
  maxChunks?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}
```

## Main Entry (`src/ingestion/pipeline.ts`)

```ts
export async function ingestDocumentation(
  url: string,
  options: IngestionOptions = {}
): Promise<IngestionResult>;
```

Orchestrates fetch → optional manifest expansion → per-page clean+chunk → cap → stats. Emits progress at every stage. The final `sourceUrl` in the result is the actual fetched document (may be a discovered `llms-full.txt`).

## Fetchers (`src/ingestion/fetchers.ts`)

```ts
export interface FetchResult { content: string; contentType: string; url: string; }

export async function fetchDocumentation(
  url: string,
  opts: { discoverLlms?: boolean } = {}
): Promise<FetchResult>;

export async function tryFetchLlmsFull(llmsTxtUrl: string): Promise<FetchResult | null>;

export function parseLlmsManifestUrls(content: string, baseUrl: string): string[];

export async function fetchPagesConcurrently(
  urls: string[],
  concurrency?: number,
  onProgress?: (completed: number, total: number) => void
): Promise<FetchResult[]>;
```

`discoverLlms` defaults to `true`. **Must** be passed as `false` for manifest sub-pages (see pipeline and fetchers for the guard that prevents wrong `metadata.url`).

## Chunker & Cleaners

```ts
export function chunkMarkdown(
  markdown: string,
  sourceUrl: string,
  baseTitle: string,
  opts: { targetSize?: number; overlap?: number; minChunkSize?: number } = {}
): IngestedChunk[];

export function htmlToMarkdown(html: string, baseUrl?: string): string;
export function normalizeMarkdown(md: string): string;
```

Chunker is heading-stack aware and the only place `sectionPath` is built.

## Detectors

```ts
export function detectSourceType(url: string, content?: string): SourceType;
export function isLikelyMarkdown(contentType: string, content: string): boolean;
```

## Example (programmatic)

```ts
import { ingestDocumentation } from 'hoolix/ingestion/pipeline.js';
import { createRAGForServer } from 'hoolix/rag/store.js';

const result = await ingestDocumentation('https://docs.x.ai/llms.txt', {
  maxPages: 40,
  onProgress: (p) => console.log(p.message),
});
const rag = await createRAGForServer('my-docs');
await rag.indexChunks(result.chunks);
```

## See Also

- [Architecture: Ingestion Pipeline](../architecture/ingestion-pipeline)
- [Guides: Multi-page](../guides/multi-page-llms)
