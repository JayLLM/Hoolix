import type { ServerMetadata } from '../core/registry.js';
import type { ServerStatus } from '../process/manager.js';
import type { EmbeddingModel } from '../rag/models.js';
import type { RAGDiagnostics, SearchResult, TableOfContentsItem } from '../rag/types.js';
import type { SourceType, IngestionResult } from '../ingestion/types.js';
import type { AppProgressHandler } from './events.js';
import type { ServerDefinition, SourceDefinition } from '../sources/types.js';

export interface CreateServerInput {
  name: string;
  url?: string;
  sources?: SourceDefinition[];
  definition?: ServerDefinition;
  templateId?: string;
  templateInputs?: Record<string, string>;  // non-sensitive inputs (e.g. allowedPath, dbPath)
  credentials?: Record<string, string>;     // sensitive credentials stored in credentials.json
  embeddingModel: EmbeddingModel;
  maxChunks?: number;
  maxPages?: number;
  onProgress?: AppProgressHandler;
}

export interface CreateServerResult {
  meta: ServerMetadata;
  ingestion: IngestionResult;
  indexLabel: string;
  indexWarning?: string;
}

export interface ReindexServerInput {
  slug: string;
  embeddingModel: EmbeddingModel;
  maxChunks?: number;
  maxPages?: number;
  incremental?: boolean;
  force?: boolean;
  onProgress?: AppProgressHandler;
}

export interface ReindexServerResult {
  meta: ServerMetadata;
  ingestion: IngestionResult;
  indexLabel: string;
  indexWarning?: string;
  skipped?: boolean;
  reason?: string;
}

export interface DeleteServerResult {
  slug: string;
  deleted: true;
}

export interface ServerListItem extends ServerMetadata {
  status?: ServerStatus;
}

export interface ServerInfoResult {
  meta: ServerMetadata;
  status: ServerStatus;
}

export interface VerifySample {
  query: string;
  hits: number;
  top: {
    title?: string;
    sectionPath?: string;
    url: string;
    score?: number;
  } | null;
  grounded: boolean;
  weak: boolean;
  results: SearchResult[];
}

export interface VerifyReport {
  slug: string;
  name: string;
  sourceUrl: string;
  sourceType: SourceType;
  chunkCount: number;
  validation: { valid: boolean; issues: string[] };
  searchable: boolean;
  groundingPercent: number;
  sourceCoveragePercent: number | null;
  uniqueSourceUrls: number | null;
  totalChars: number | null;
  averageChunkChars: number | null;
  duplicateChunkIds: number | null;
  weakQueries: string[];
  ingestion: {
    pagesProcessed?: number;
    pagesDiscovered?: number;
    maxPages?: number;
    maxChunks?: number;
    truncated: boolean;
    note?: string;
  };
  samples: VerifySample[];
  tocEntries: number;
  tocPreview: TableOfContentsItem[];
  toc: TableOfContentsItem[];
  diagnostics: RAGDiagnostics | null;
  embeddingModel: EmbeddingModel;
  freshnessUpdatedAt: string;
  definition: ServerDefinition;
  sourceCount: number;
  sourceLabels: string[];
}
