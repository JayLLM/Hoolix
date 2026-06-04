import path from 'node:path';
import fs from 'fs-extra';
import { z } from 'zod';
import { getPaths } from '../core/paths.js';
import type { SourceDefinition } from './types.js';

export const SourcePluginSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  kind: z.enum(['docs', 'web', 'llms', 'github']).default('docs'),
  urlTemplate: z.string().min(1),
});

export type SourcePlugin = z.infer<typeof SourcePluginSchema>;

export async function listSourcePlugins(): Promise<SourcePlugin[]> {
  const dirs = pluginDirs();
  const plugins: SourcePlugin[] = [];
  for (const dir of dirs) {
    if (!(await fs.pathExists(dir))) continue;
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readJson(path.join(dir, file));
        plugins.push(SourcePluginSchema.parse(raw));
      } catch {
        // Skip invalid plugin manifests; doctor can be extended later to validate them loudly.
      }
    }
  }
  return plugins.sort((a, b) => a.id.localeCompare(b.id));
}

export async function resolveCustomSource(provider: string, value: string): Promise<SourceDefinition> {
  const plugin = (await listSourcePlugins()).find((candidate) => candidate.id === provider);
  if (!plugin) {
    throw new Error(`Custom source provider "${provider}" not found. Next: add a JSON manifest to ${path.join(getPaths().data, 'source-plugins')} or set HOOLIX_SOURCE_PLUGIN_DIR.`);
  }
  const resolved = plugin.urlTemplate.replace(/\{value\}/g, encodeURIComponent(value)).replace(/\{raw\}/g, value);
  if (plugin.kind === 'github') {
    return { type: 'github', repo: value, label: plugin.name };
  }
  return {
    type: plugin.kind,
    url: resolved,
    label: plugin.name,
  } as SourceDefinition;
}

function pluginDirs(): string[] {
  const dirs = [path.join(getPaths().data, 'source-plugins')];
  const extra = process.env.HOOLIX_SOURCE_PLUGIN_DIR;
  if (extra) dirs.push(...extra.split(path.delimiter).filter(Boolean));
  return dirs;
}
