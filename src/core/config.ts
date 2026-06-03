import { z } from 'zod';
import fs from 'fs-extra';
import { getPaths } from './paths.js';
import { logger } from './logger.js';
import { SUPPORTED_EMBEDDING_MODELS } from '../rag/models.js';

export const ConfigSchema = z.object({
  version: z.string().default('0.1.0'),
  defaultBasePort: z.number().int().min(1024).max(65535).default(3456),
  telemetryOptOut: z.boolean().default(false),
  // Preferred embedding model for new servers (create/reindex honor this unless --embedding-model or --hybrid override).
  // See src/rag/models.ts for full list + details (DRY).
  preferredEmbedding: z.enum(SUPPORTED_EMBEDDING_MODELS as any).catch('fuse').default('fuse'),
  openaiApiKey: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = {
  version: '0.1.0',
  defaultBasePort: 3456,
  telemetryOptOut: false,
  preferredEmbedding: 'fuse',
};

let cachedConfig: Config | null = null;

export async function loadConfig(): Promise<Config> {
  if (cachedConfig) return cachedConfig;

  const { config: configPath } = getPaths();
  await fs.ensureDir(getPaths().data);

  try {
    if (await fs.pathExists(configPath)) {
      const raw = await fs.readJson(configPath);
      const parsed = ConfigSchema.parse(raw);
      cachedConfig = parsed;
      return parsed;
    }
  } catch (err) {
    logger.warn('Failed to load config, using defaults:', err);
  }

  cachedConfig = DEFAULT_CONFIG;
  await saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

export async function saveConfig(config: Config): Promise<void> {
  const { config: configPath } = getPaths();
  await fs.ensureDir(getPaths().data);
  await fs.writeJson(configPath, config, { spaces: 2 });
  cachedConfig = config;
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const next = { ...current, ...updates };
  await saveConfig(next);
  return next;
}
