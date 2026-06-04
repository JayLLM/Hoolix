export type SourceType = 'llms.txt' | 'github' | 'generic' | 'manual';

export interface IngestedChunk {
  id: string;
  content: string;
  metadata: {
    url: string;
    title: string;
    sectionPath?: string;
    headings?: string[];
    charCount: number;
    order: number;
    sourceId?: string;
    sourceType?: string;
    sourceLabel?: string;
  };
}

export interface IngestionResult {
  sourceUrl: string;
  sourceType: SourceType;
  title: string;
  chunks: IngestedChunk[];
  stats: {
    totalChunks: number;
    totalChars: number;
    pagesProcessed: number;
    pagesDiscovered?: number;
    durationMs: number;
    truncated: boolean;
    maxChunks: number;
    maxPages: number;
  };
  rawMarkdown?: string; // optional: store a concatenated version for debugging/export
}

export interface IngestionProgress {
  stage: 'detect' | 'fetch' | 'manifest' | 'pages' | 'clean' | 'chunk' | 'embed' | 'done';
  message: string;
  current?: number;
  total?: number;
  percent?: number;
}

export type ProgressCallback = (progress: IngestionProgress) => void;

export interface IngestionOptions {
  maxPages?: number;
  maxChunks?: number;
  chunkSize?: number;        // target chars
  chunkOverlap?: number;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}
