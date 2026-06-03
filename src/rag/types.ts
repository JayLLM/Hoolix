export interface SearchResult {
  content: string;
  score: number;
  metadata: {
    url: string;
    title: string;
    sectionPath?: string;
    headings?: string[];
    charCount: number;
  };
  citationId?: string;
}

export interface ReadPageResult {
  url: string;
  title: string;
  content: string;           // concatenated relevant chunks
  chunks: Array<{
    content: string;
    sectionPath?: string;
  }>;
}

export interface TableOfContentsItem {
  title: string;
  level: number;
  url?: string;
  sectionPath?: string;
  order?: number;
}

export interface RAGDiagnostics {
  totalChunks: number;
  chunksWithUrl: number;
  sourceCoveragePercent: number;
  uniqueSourceUrls: number;
  totalChars: number;
  averageChunkChars: number;
  ordered: boolean;
  duplicateChunkIds: number;
  urls: string[];
}

// Re-export the canonical union + helpers (source of truth lives in ./models.ts for DRY + easy extension of new hybrid models)
export type { EmbeddingModel } from './models.js';
export {
  SUPPORTED_EMBEDDING_MODELS,
  isHybridModel,
  getEmbeddingConfig,
  type EmbeddingConfig,
} from './models.js';

export interface RAGSearchOptions {
  limit?: number;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  filterUrl?: string;
  /** Semantic weight for weighted hybrid blend (0 = pure kw, 1 = pure semantic). Default 0.7 */
  alpha?: number;
  /** Enable advanced reranker (rrf = Reciprocal Rank Fusion on separate kw+sem rankings; good for hybrid relevance) */
  reranker?: 'rrf' | 'weighted' | false;
  /** RRF constant (higher = more emphasis on top ranks). Default 60 */
  rrfK?: number;
}
