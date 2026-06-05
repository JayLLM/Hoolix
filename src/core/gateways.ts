import { z } from 'zod';
import fs from 'fs-extra';
import path from 'node:path';
import {
  ensureDirectories,
  getGatewayConfigPath,
  getGatewayDataDir,
  getGatewayDir,
  getPaths,
} from './paths.js';
import { generateAuthKey } from '../lib/auth.js';
import { getServerMetadata, slugify } from './registry.js';

export const GatewayBackingSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/),
  namespace: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  templateId: z.string().optional(),
});

export const GatewayConfigSchema = z.object({
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/),
  authKey: z.string().min(16),
  backends: z.array(GatewayBackingSchema).min(1),
  createdAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime(),
});

export type GatewayBacking = z.infer<typeof GatewayBackingSchema>;
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

const GATEWAY_INDEX_FILE = 'gateways.json';

interface GatewayIndex {
  version: string;
  gateways: Record<string, { slug: string; path: string }>;
}

function gatewayIndexPath(): string {
  return path.join(getPaths().data, GATEWAY_INDEX_FILE);
}

async function loadGatewayIndex(): Promise<GatewayIndex> {
  await ensureDirectories();
  const indexPath = gatewayIndexPath();
  if (!(await fs.pathExists(indexPath))) {
    const fresh: GatewayIndex = { version: '1.0.0', gateways: {} };
    await fs.writeJson(indexPath, fresh, { spaces: 2 });
    return fresh;
  }
  return fs.readJson(indexPath) as Promise<GatewayIndex>;
}

async function saveGatewayIndex(index: GatewayIndex): Promise<void> {
  await fs.writeJson(gatewayIndexPath(), index, { spaces: 2 });
}

function namespaceFromTemplate(templateId: string | undefined, slug: string): string {
  const base = templateId || slug;
  return slugify(base.replace(/-api$/, '').replace(/-search$/, ''));
}

function dedupeNamespace(namespace: string, seen: Set<string>, fallback: string): string {
  if (!seen.has(namespace)) {
    seen.add(namespace);
    return namespace;
  }
  const bySlug = slugify(fallback);
  if (!seen.has(bySlug)) {
    seen.add(bySlug);
    return bySlug;
  }
  let i = 2;
  while (seen.has(`${bySlug}-${i}`)) i++;
  const next = `${bySlug}-${i}`;
  seen.add(next);
  return next;
}

export async function createGateway(name: string, includes: string[]): Promise<GatewayConfig> {
  const slug = slugify(name);
  const uniqueIncludes = [...new Set(includes.map((include) => slugify(include)).filter(Boolean))];
  if (uniqueIncludes.length === 0) {
    throw new Error('Gateway needs at least one --include <server-slug>. Next: run hoolix list.');
  }

  const index = await loadGatewayIndex();
  if (index.gateways[slug]) {
    throw new Error(`Gateway "${slug}" already exists. Next: run hoolix gateway list.`);
  }

  const seenNamespaces = new Set<string>();
  const backends: GatewayBacking[] = [];
  for (const include of uniqueIncludes) {
    const meta = await getServerMetadata(include);
    if ((meta.serverKind ?? 'docs-rag') !== 'mcp-server') {
      throw new Error(`"${include}" is ${meta.serverKind ?? 'docs-rag'}, not mcp-server. Next: include only installed MCP server templates.`);
    }
    const templateId = meta.definition?.template?.id;
    const namespace = dedupeNamespace(namespaceFromTemplate(templateId, meta.slug), seenNamespaces, meta.slug);
    backends.push({ slug: meta.slug, namespace, templateId });
  }

  const now = new Date().toISOString();
  const config: GatewayConfig = {
    name,
    slug,
    authKey: generateAuthKey(),
    backends,
    createdAt: now,
    lastUpdatedAt: now,
  };

  await fs.ensureDir(getGatewayDir(slug));
  await fs.ensureDir(getGatewayDataDir(slug));
  await fs.writeJson(getGatewayConfigPath(slug), config, { spaces: 2 });
  index.gateways[slug] = { slug, path: getGatewayDir(slug) };
  await saveGatewayIndex(index);
  return config;
}

export async function listGateways(): Promise<GatewayConfig[]> {
  const index = await loadGatewayIndex();
  const gateways: GatewayConfig[] = [];
  for (const { slug } of Object.values(index.gateways)) {
    try {
      gateways.push(await getGateway(slug));
    } catch {
      // Ignore corrupt gateway entries in list output.
    }
  }
  return gateways.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGateway(slug: string): Promise<GatewayConfig> {
  const pathToConfig = getGatewayConfigPath(slugify(slug));
  if (!(await fs.pathExists(pathToConfig))) {
    throw new Error(`Gateway "${slug}" not found. Next: run hoolix gateway list.`);
  }
  return GatewayConfigSchema.parse(await fs.readJson(pathToConfig));
}
