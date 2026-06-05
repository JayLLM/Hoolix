import { z } from 'zod';
import fs from 'fs-extra';
import path from 'node:path';
import { getPaths, getServerDir, getServerMetadataPath, getServerDataDir, ensureDirectories } from './paths.js';
import { logger } from './logger.js';
import { ServerNotFoundError, ServerAlreadyExistsError } from './errors.js';
import { SUPPORTED_EMBEDDING_MODELS } from '../rag/models.js';
import { ServerDefinitionSchema, type ServerDefinition } from '../sources/types.js';
import { createLegacyServerDefinition } from '../sources/registry.js';

export const METADATA_SCHEMA_VERSION = 1;

export const ServerMetadataSchema = z.object({
  schemaVersion: z.number().int().nonnegative().default(METADATA_SCHEMA_VERSION),
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/),
  sourceUrl: z.string().url(),
  sourceType: z.enum(['llms.txt', 'github', 'generic', 'manual']).default('generic'),
  ingestionVersion: z.string().default('1.0.0'),
  // Embedding model for the server. Source of truth + supported list is in src/rag/models.ts (DRY).
  // 'fuse' = default zero-dep. 'hybrid-bge-*' = optional semantic via lazy transformers + cosine/RRF.
  embeddingModel: z.enum(SUPPORTED_EMBEDDING_MODELS as any).catch('fuse').default('fuse'),
  chunkCount: z.number().int().nonnegative(),
  ingestionStats: z.object({
    totalChunks: z.number().int().nonnegative(),
    totalChars: z.number().int().nonnegative(),
    pagesProcessed: z.number().int().nonnegative(),
    pagesDiscovered: z.number().int().nonnegative().optional(),
    durationMs: z.number().int().nonnegative(),
    truncated: z.boolean(),
    maxChunks: z.number().int().positive(),
    maxPages: z.number().int().positive(),
  }).optional(),
  vectorIndexed: z.boolean().default(false),
  createdAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime(),
  lastStartedAt: z.string().datetime().optional(),
  authKey: z.string().min(16), // crypto-generated at create; only returned at start time
  desiredState: z.enum(['running', 'stopped']).default('stopped'),
  serverKind: z.enum(['docs-rag', 'mcp-server']).default('docs-rag'),
  credentialKeys: z.array(z.string()).default([]), // names of stored credentials (values in credentials.json)
  definition: ServerDefinitionSchema.optional(),
  sourceFingerprint: z.string().optional(),
  lastReindexAt: z.string().datetime().optional(),
  reindexSchedule: z.object({
    enabled: z.boolean().default(false),
    intervalHours: z.number().int().positive().default(24),
    nextRunAt: z.string().datetime().optional(),
  }).optional(),
});

export type ServerMetadata = z.infer<typeof ServerMetadataSchema>;
export type { EmbeddingModel } from '../rag/models.js';

export interface RegistryIndex {
  version: string;
  servers: Record<string, { slug: string; path: string }>; // slug -> on-disk dir
}

const REGISTRY_FILE = 'registry.json';

async function loadRegistryIndex(): Promise<RegistryIndex> {
  const { data } = getPaths();
  const registryPath = path.join(data, REGISTRY_FILE);

  if (!(await fs.pathExists(registryPath))) {
    const fresh: RegistryIndex = { version: '1.0.0', servers: {} };
    await fs.writeJson(registryPath, fresh, { spaces: 2 });
    return fresh;
  }

  return fs.readJson(registryPath) as Promise<RegistryIndex>;
}

async function saveRegistryIndex(index: RegistryIndex): Promise<void> {
  const { data } = getPaths();
  await fs.writeJson(path.join(data, REGISTRY_FILE), index, { spaces: 2 });
}

export async function listServers(): Promise<ServerMetadata[]> {
  await ensureDirectories();
  const index = await loadRegistryIndex();
  const results: ServerMetadata[] = [];

  for (const { slug } of Object.values(index.servers)) {
    try {
      const meta = await getServerMetadata(slug);
      results.push(meta);
    } catch (err) {
      logger.warn(`Skipping corrupt server entry for ${slug}`);
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getServerMetadata(slug: string): Promise<ServerMetadata> {
  const metaPath = getServerMetadataPath(slug);
  if (!(await fs.pathExists(metaPath))) {
    throw new ServerNotFoundError(slug);
  }
  const raw = await fs.readJson(metaPath);
  const parsed = ServerMetadataSchema.parse(raw);

  // Migration: backfill schemaVersion and definition on older records.
  let needsWrite = false;
  let migrated: ServerMetadata = parsed;

  if (!parsed.definition) {
    migrated = { ...migrated, definition: createLegacyServerDefinition(parsed.sourceUrl, parsed.sourceType) };
    needsWrite = true;
  }
  if ((parsed.schemaVersion ?? 0) < METADATA_SCHEMA_VERSION) {
    migrated = { ...migrated, schemaVersion: METADATA_SCHEMA_VERSION };
    needsWrite = true;
  }

  if (needsWrite) {
    await fs.writeJson(metaPath, migrated, { spaces: 2 }).catch(() => {});
  }
  return migrated;
}

export async function saveServerMetadata(meta: ServerMetadata): Promise<void> {
  const dir = getServerDir(meta.slug);
  await fs.ensureDir(dir);
  await fs.ensureDir(path.join(dir, 'data'));

  const metaPath = getServerMetadataPath(meta.slug);
  await fs.writeJson(metaPath, meta, { spaces: 2 });

  const index = await loadRegistryIndex();
  index.servers[meta.slug] = { slug: meta.slug, path: dir };
  await saveRegistryIndex(index);
}

export async function registerServer(meta: Omit<ServerMetadata, 'createdAt' | 'lastUpdatedAt' | 'schemaVersion'>): Promise<ServerMetadata> {
  const now = new Date().toISOString();

  const full: ServerMetadata = {
    schemaVersion: METADATA_SCHEMA_VERSION,
    ...meta,
    createdAt: now,
    lastUpdatedAt: now,
  };

  const index = await loadRegistryIndex();
  if (index.servers[full.slug]) {
    throw new ServerAlreadyExistsError(full.slug);
  }

  await saveServerMetadata(full);
  logger.success(`Registered server "${full.name}" (${full.slug})`);
  return full;
}

export async function deleteServer(slug: string, { removeData = true }: { removeData?: boolean } = {}): Promise<void> {
  const dir = getServerDir(slug);
  const index = await loadRegistryIndex();

  delete index.servers[slug];
  await saveRegistryIndex(index);

  if (removeData && (await fs.pathExists(dir))) {
    await fs.remove(dir);
    logger.info(`Removed data directory for ${slug}`);
  }

  logger.success(`Deleted server "${slug}"`);
}

export async function updateServerMetadata(slug: string, updates: Partial<ServerMetadata>): Promise<ServerMetadata> {
  const current = await getServerMetadata(slug);
  const next = {
    ...current,
    ...updates,
    lastUpdatedAt: new Date().toISOString(),
  } as ServerMetadata;

  const validated = ServerMetadataSchema.parse(next);
  await saveServerMetadata(validated);
  return validated;
}

export function getServerDefinition(meta: ServerMetadata): ServerDefinition {
  return meta.definition || createLegacyServerDefinition(meta.sourceUrl, meta.sourceType);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `server-${Date.now()}`;
}

/**
 * On-disk chunk count (or null). Used by validateServerState (no full RAG load).
 */
export async function getOnDiskChunkCount(slug: string): Promise<number | null> {
  try {
    const dataDir = getServerDataDir(slug);
    const chunksPath = path.join(dataDir, 'chunks.json');
    if (!(await fs.pathExists(chunksPath))) return null;
    const data = await fs.readJson(chunksPath);
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

/** Lightweight state validation (chunk count match + readable metadata) for list/info/verify. */
export async function validateServerState(slug: string): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];
  let meta: ServerMetadata | null = null;
  try {
    meta = await getServerMetadata(slug);
  } catch {
    issues.push('metadata unreadable or corrupt');
    return { valid: false, issues };
  }
  const onDisk = await getOnDiskChunkCount(slug);
  if (onDisk === null) {
    issues.push('chunks.json missing — RAG will return no results (run "hoolix reindex ' + slug + '")');  
  } else if (meta && onDisk !== meta.chunkCount) {
    issues.push(`chunk count mismatch (registry claims ${meta.chunkCount}, disk has ${onDisk})`);
  }
  return { valid: issues.length === 0, issues };
}
