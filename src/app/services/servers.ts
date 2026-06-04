import fs from 'fs-extra';
import path from 'node:path';
import {
  deleteServer as deleteServerFromRegistry,
  getServerMetadata,
  listServers as listServersFromRegistry,
  registerServer,
  slugify,
  updateServerMetadata,
  validateServerState,
  type ServerMetadata,
} from '../../core/registry.js';
import { getServerDir } from '../../core/paths.js';
import { ingestDocumentation } from '../../ingestion/pipeline.js';
import { generateAuthKey } from '../../lib/auth.js';
import { serverManager } from '../../process/manager.js';
import { createRAGForServer } from '../../rag/store.js';
import { isHybridModel, type EmbeddingModel } from '../../rag/models.js';
import {
  emitProgress,
  fromIngestionProgress,
  type AppProgressHandler,
} from '../events.js';
import type {
  CreateServerInput,
  CreateServerResult,
  DeleteServerResult,
  ReindexServerInput,
  ReindexServerResult,
  ServerInfoResult,
  ServerListItem,
  VerifyReport,
  VerifySample,
} from '../contracts.js';

const DEFAULT_MAX_CHUNKS = 6000;
const DEFAULT_MAX_PAGES = 80;

function indexLabel(embeddingModel: EmbeddingModel): string {
  return isHybridModel(embeddingModel) ? `Hybrid (${embeddingModel})` : 'Fuse.js';
}

function likelyTruncated(meta: ServerMetadata): boolean {
  const stats = meta.ingestionStats;
  return !!stats?.truncated || (
    typeof stats?.maxChunks === 'number' && meta.chunkCount >= stats.maxChunks
  );
}

async function indexChunksForServer(
  slug: string,
  chunks: CreateServerResult['ingestion']['chunks'],
  embeddingModel: EmbeddingModel,
  onProgress?: AppProgressHandler,
): Promise<string | undefined> {
  emitProgress(onProgress, { stage: 'index', message: 'Building search index...' });
  try {
    const rag = await createRAGForServer(slug, embeddingModel);
    await rag.indexChunks(chunks, {
      embeddingModel,
      onProgress: (p) => emitProgress(onProgress, {
        stage: 'embed',
        message: p.message,
        current: p.current,
        total: p.total,
      }),
    });
    await rag.close?.();
    emitProgress(onProgress, { stage: 'index', message: `Search index built (${indexLabel(embeddingModel)})` });
    return undefined;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    emitProgress(onProgress, { stage: 'index', message: 'Search index step had issues' });
    return message;
  }
}

export async function createServer(input: CreateServerInput): Promise<CreateServerResult> {
  const slug = slugify(input.name);
  const maxChunks = input.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const maxPages = input.maxPages ?? DEFAULT_MAX_PAGES;

  const ingestion = await ingestDocumentation(input.url, {
    maxChunks,
    maxPages,
    onProgress: (p) => emitProgress(input.onProgress, fromIngestionProgress(p)),
  });

  const indexWarning = await indexChunksForServer(
    slug,
    ingestion.chunks,
    input.embeddingModel,
    input.onProgress,
  );

  emitProgress(input.onProgress, { stage: 'register', message: 'Registering server...' });
  const meta = await registerServer({
    name: input.name,
    slug,
    sourceUrl: ingestion.sourceUrl,
    sourceType: ingestion.sourceType,
    ingestionVersion: '1.0.0',
    embeddingModel: input.embeddingModel,
    chunkCount: ingestion.stats.totalChunks,
    ingestionStats: ingestion.stats,
    vectorIndexed: isHybridModel(input.embeddingModel),
    authKey: generateAuthKey(),
    desiredState: 'stopped',
  });

  emitProgress(input.onProgress, { stage: 'done', message: 'Server created successfully' });
  return {
    meta,
    ingestion,
    indexLabel: indexLabel(input.embeddingModel),
    indexWarning,
  };
}

export async function reindexServer(input: ReindexServerInput): Promise<ReindexServerResult> {
  const current = await getServerMetadata(input.slug);
  if (!current.sourceUrl) {
    throw new Error('This server has no recorded sourceUrl and cannot be reindexed.');
  }

  const maxChunks = input.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const maxPages = input.maxPages ?? DEFAULT_MAX_PAGES;

  const ingestion = await ingestDocumentation(current.sourceUrl, {
    maxChunks,
    maxPages,
    onProgress: (p) => emitProgress(input.onProgress, fromIngestionProgress(p)),
  });

  const indexWarning = await indexChunksForServer(
    input.slug,
    ingestion.chunks,
    input.embeddingModel,
    input.onProgress,
  );

  const meta = await updateServerMetadata(input.slug, {
    chunkCount: ingestion.stats.totalChunks,
    sourceType: ingestion.sourceType,
    ingestionStats: ingestion.stats,
    embeddingModel: input.embeddingModel,
    vectorIndexed: isHybridModel(input.embeddingModel),
  });

  emitProgress(input.onProgress, { stage: 'done', message: 'Server reindexed successfully' });
  return {
    meta,
    ingestion,
    indexLabel: indexLabel(input.embeddingModel),
    indexWarning,
  };
}

export async function deleteRegisteredServer(slug: string): Promise<DeleteServerResult> {
  await deleteServerFromRegistry(slug);
  return { slug, deleted: true };
}

export async function listRegisteredServers(options: { includeStatus?: boolean } = {}): Promise<ServerListItem[]> {
  const servers = await listServersFromRegistry();
  if (!options.includeStatus) return servers;

  const enriched: ServerListItem[] = [];
  for (const server of servers) {
    enriched.push({
      ...server,
      status: await serverManager.getStatus(server.slug),
    });
  }
  return enriched;
}

export async function getServerInfo(slug: string): Promise<ServerInfoResult> {
  const meta = await getServerMetadata(slug);
  const status = await serverManager.getStatus(slug);
  return { meta, status };
}

export async function getServerLogTail(slug: string, maxChars = 8000): Promise<string> {
  const logPath = path.join(getServerDir(slug), 'host.log');
  try {
    const content = await fs.readFile(logPath, 'utf8');
    return content.slice(-maxChars) || '(empty)';
  } catch {
    return '(no host.log yet for this server)';
  }
}

export async function verifyServer(slug: string, queries = ['overview', 'install', 'getting started', 'api', 'configuration']): Promise<VerifyReport> {
  const meta = await getServerMetadata(slug);
  const validation = await validateServerState(slug);
  const rag = await createRAGForServer(slug, (meta.embeddingModel as EmbeddingModel) || 'fuse');
  const diagnostics = await rag.getDiagnostics?.() ?? null;

  const samples: VerifySample[] = [];
  let groundedCount = 0;
  const weakQueries: string[] = [];

  for (const query of queries) {
    const results = await rag.search(query, { limit: 2, mode: 'hybrid' });
    const top = results[0];
    if (top?.metadata.url) groundedCount++;
    const grounded = !!top?.metadata.url;
    const weak = results.length === 0 || !grounded || (top?.score ?? 0) < 0.45;
    if (weak) weakQueries.push(query);
    samples.push({
      query,
      hits: results.length,
      top: top ? {
        title: top.metadata.title,
        sectionPath: top.metadata.sectionPath,
        url: top.metadata.url,
        score: top.score,
      } : null,
      grounded,
      weak,
      results,
    });
  }

  const toc = await rag.getTableOfContents();
  const ingestionStats = meta.ingestionStats || null;

  return {
    slug,
    name: meta.name,
    sourceUrl: meta.sourceUrl,
    sourceType: meta.sourceType,
    chunkCount: meta.chunkCount,
    validation,
    searchable: samples.some((sample) => sample.hits > 0),
    groundingPercent: Math.round((groundedCount / queries.length) * 100),
    sourceCoveragePercent: diagnostics?.sourceCoveragePercent ?? null,
    uniqueSourceUrls: diagnostics?.uniqueSourceUrls ?? null,
    totalChars: diagnostics?.totalChars ?? null,
    averageChunkChars: diagnostics?.averageChunkChars ?? null,
    duplicateChunkIds: diagnostics?.duplicateChunkIds ?? null,
    weakQueries,
    ingestion: ingestionStats ? {
      pagesProcessed: ingestionStats.pagesProcessed,
      pagesDiscovered: ingestionStats.pagesDiscovered,
      maxPages: ingestionStats.maxPages,
      maxChunks: ingestionStats.maxChunks,
      truncated: likelyTruncated(meta),
    } : {
      truncated: likelyTruncated(meta),
      note: 'No persisted ingestion stats; reindex to record cap details.',
    },
    samples,
    tocEntries: toc.length,
    tocPreview: toc.slice(0, 12),
    toc,
    diagnostics,
    embeddingModel: meta.embeddingModel as EmbeddingModel,
    freshnessUpdatedAt: meta.lastUpdatedAt,
  };
}
