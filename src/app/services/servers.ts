import fs from 'fs-extra';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  deleteServer as deleteServerFromRegistry,
  getServerMetadata,
  getServerDefinition,
  listServers as listServersFromRegistry,
  registerServer,
  slugify,
  updateServerMetadata,
  validateServerState,
  type ServerMetadata,
} from '../../core/registry.js';
import { getServerDir } from '../../core/paths.js';
import { ingestDocumentation } from '../../ingestion/pipeline.js';
import type { IngestedChunk, IngestionResult } from '../../ingestion/types.js';
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
import {
  createLegacyServerDefinition,
  sourceLabel,
  sourceListLabel,
  sourceHeaders,
  sourceToIngestionUrl,
  summarizeDefinition,
} from '../../sources/registry.js';
import { ServerDefinitionSchema, type ServerDefinition } from '../../sources/types.js';
import { resolveCustomSource } from '../../sources/plugins.js';

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
  chunks: IngestedChunk[],
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

function resolveCreateDefinition(input: CreateServerInput): ServerDefinition {
  if (input.definition) return ServerDefinitionSchema.parse(input.definition);
  if (input.sources && input.sources.length > 0) {
    return ServerDefinitionSchema.parse({ version: 1, sources: input.sources });
  }
  if (input.url) return createLegacyServerDefinition(input.url, 'generic');
  throw new Error('Missing source. Next: pass --url <url> or one or more --source type:value entries.');
}

function makeSourceId(index: number): string {
  return `source_${index + 1}`;
}

function combineIngestionResults(definition: ServerDefinition, results: IngestionResult[], maxChunks: number, maxPages: number): IngestionResult {
  const chunks: IngestedChunk[] = [];
  let order = 0;
  let truncated = false;

  for (let sourceIndex = 0; sourceIndex < results.length; sourceIndex++) {
    const source = definition.sources[sourceIndex];
    const result = results[sourceIndex];
    const id = makeSourceId(sourceIndex);
    const label = sourceLabel(source);

    for (const chunk of result.chunks) {
      if (chunks.length >= maxChunks) {
        truncated = true;
        break;
      }
      chunks.push({
        ...chunk,
        id: `${id}_${chunk.id}`,
        metadata: {
          ...chunk.metadata,
          order: order++,
          sourceId: id,
          sourceType: source.type,
          sourceLabel: label,
        },
      });
    }
    if (truncated) break;
  }

  const primary = results[0];
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
  const stats = {
    totalChunks: chunks.length,
    totalChars,
    pagesProcessed: results.reduce((sum, result) => sum + result.stats.pagesProcessed, 0),
    pagesDiscovered: results.reduce((sum, result) => sum + (result.stats.pagesDiscovered ?? result.stats.pagesProcessed), 0),
    durationMs: results.reduce((sum, result) => sum + result.stats.durationMs, 0),
    truncated: truncated || results.some((result) => result.stats.truncated),
    maxChunks,
    maxPages,
  };

  return {
    sourceUrl: primary.sourceUrl,
    sourceType: primary.sourceType,
    title: primary.title,
    chunks,
    stats,
    rawMarkdown: results.map((result) => result.rawMarkdown || '').filter(Boolean).join('\n\n---\n\n').slice(0, 50_000),
  };
}

async function ingestDefinition(
  definition: ServerDefinition,
  options: {
    maxChunks: number;
    maxPages: number;
    onProgress?: AppProgressHandler;
  },
): Promise<IngestionResult> {
  const resolvedDefinition = await resolveDefinitionSources(definition);
  if (resolvedDefinition.sources.length === 1) {
    const source = resolvedDefinition.sources[0];
    return ingestDocumentation(sourceToIngestionUrl(source), {
      maxChunks: options.maxChunks,
      maxPages: options.maxPages,
      headers: sourceHeaders(source),
      onProgress: (p) => emitProgress(options.onProgress, fromIngestionProgress(p)),
    });
  }

  const results: IngestionResult[] = [];
  for (let i = 0; i < resolvedDefinition.sources.length; i++) {
    const source = resolvedDefinition.sources[i];
    emitProgress(options.onProgress, {
      stage: 'fetch',
      message: `Ingesting source ${i + 1}/${resolvedDefinition.sources.length}: ${sourceLabel(source)}`,
      current: i + 1,
      total: resolvedDefinition.sources.length,
    });
    const result = await ingestDocumentation(sourceToIngestionUrl(source), {
      maxChunks: options.maxChunks,
      maxPages: options.maxPages,
      headers: sourceHeaders(source),
      onProgress: (p) => emitProgress(options.onProgress, {
        ...fromIngestionProgress(p),
        message: `[${sourceLabel(source)}] ${p.message}`,
      }),
    });
    results.push(result);
  }

  return combineIngestionResults(resolvedDefinition, results, options.maxChunks, options.maxPages);
}

async function resolveDefinitionSources(definition: ServerDefinition): Promise<ServerDefinition> {
  const sources = [];
  for (const source of definition.sources) {
    if (source.type === 'custom') {
      sources.push(await resolveCustomSource(source.provider, source.value));
    } else {
      sources.push(source);
    }
  }
  return { ...definition, sources };
}

export async function createServer(input: CreateServerInput): Promise<CreateServerResult> {
  const slug = slugify(input.name);
  const maxChunks = input.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const maxPages = input.maxPages ?? DEFAULT_MAX_PAGES;
  const definition = resolveCreateDefinition(input);

  const ingestion = await ingestDefinition(definition, {
    maxChunks,
    maxPages,
    onProgress: input.onProgress,
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
    sourceFingerprint: fingerprintChunks(ingestion.chunks),
    vectorIndexed: isHybridModel(input.embeddingModel),
    authKey: generateAuthKey(),
    desiredState: 'stopped',
    definition,
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
  const definition = getServerDefinition(current);
  if (!definition.sources.length && !current.sourceUrl) {
    throw new Error('This server has no recorded sourceUrl and cannot be reindexed.');
  }

  const maxChunks = input.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const maxPages = input.maxPages ?? DEFAULT_MAX_PAGES;

  const ingestion = await ingestDefinition(definition, {
    maxChunks,
    maxPages,
    onProgress: input.onProgress,
  });

  const nextFingerprint = fingerprintChunks(ingestion.chunks);
  if (input.incremental !== false && !input.force && current.sourceFingerprint && current.sourceFingerprint === nextFingerprint) {
    const meta = await updateServerMetadata(input.slug, {
      lastReindexAt: new Date().toISOString(),
      reindexSchedule: nextSchedule(current.reindexSchedule),
      definition,
    });
    emitProgress(input.onProgress, { stage: 'done', message: 'No source changes detected; index is already current.' });
    return {
      meta,
      ingestion,
      indexLabel: indexLabel(input.embeddingModel),
      skipped: true,
      reason: 'unchanged',
    };
  }

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
    sourceFingerprint: nextFingerprint,
    lastReindexAt: new Date().toISOString(),
    reindexSchedule: nextSchedule(current.reindexSchedule),
    embeddingModel: input.embeddingModel,
    vectorIndexed: isHybridModel(input.embeddingModel),
    definition,
  });

  emitProgress(input.onProgress, { stage: 'done', message: 'Server reindexed successfully' });
  return {
    meta,
    ingestion,
    indexLabel: indexLabel(input.embeddingModel),
    indexWarning,
  };
}

export async function updateReindexSchedule(slug: string, intervalHours: number | null): Promise<ServerMetadata> {
  if (intervalHours === null) {
    return updateServerMetadata(slug, { reindexSchedule: { enabled: false, intervalHours: 24 } });
  }
  const nextRunAt = new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString();
  return updateServerMetadata(slug, {
    reindexSchedule: { enabled: true, intervalHours, nextRunAt },
  });
}

export async function listDueReindexServers(now = new Date()): Promise<ServerMetadata[]> {
  const servers = await listServersFromRegistry();
  return servers.filter((server) => {
    const schedule = server.reindexSchedule;
    if (!schedule?.enabled || !schedule.nextRunAt) return false;
    return Date.parse(schedule.nextRunAt) <= now.getTime();
  });
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
  const definition = getServerDefinition(meta);
  const summary = summarizeDefinition(definition);
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
    definition,
    sourceCount: summary.count,
    sourceLabels: summary.labels,
  };
}

export function getServerSourceLabel(meta: ServerMetadata): string {
  return sourceListLabel(getServerDefinition(meta));
}

function fingerprintChunks(chunks: IngestedChunk[]): string {
  const hash = createHash('sha256');
  for (const chunk of chunks) {
    hash.update(chunk.metadata.url);
    hash.update('\0');
    hash.update(chunk.content);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function nextSchedule(schedule: ServerMetadata['reindexSchedule']): ServerMetadata['reindexSchedule'] {
  if (!schedule?.enabled) return schedule;
  return {
    enabled: true,
    intervalHours: schedule.intervalHours,
    nextRunAt: new Date(Date.now() + schedule.intervalHours * 60 * 60 * 1000).toISOString(),
  };
}
