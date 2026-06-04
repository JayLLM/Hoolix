/**
 * Community template loader.
 *
 * Reads and validates *.json files from the user's community templates directory
 * (~/.local/share/hoolix/templates/ on Linux, ~/Library/Application Support/hoolix/templates/ on macOS,
 *  %APPDATA%\hoolix\templates on Windows, or override via HOOLIX_TEMPLATE_DIR).
 *
 * Invalid files emit a logger.warn and are skipped; they never crash the CLI.
 * Follows the same pattern as src/sources/plugins.ts.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { getPaths } from '../core/paths.js';
import { logger } from '../core/logger.js';
import { CatalogTemplateSchema, type CatalogTemplate } from './templates.js';

const COMMUNITY_SUBDIR = 'templates';

/** Absolute path to the user's community template directory. */
export function getCommunityTemplateDir(): string {
  return path.join(getPaths().data, COMMUNITY_SUBDIR);
}

/** All directories that are searched for community templates (primary + HOOLIX_TEMPLATE_DIR). */
function communityTemplateDirs(): string[] {
  const dirs = [getCommunityTemplateDir()];
  const extra = process.env.HOOLIX_TEMPLATE_DIR;
  if (extra) dirs.push(...extra.split(path.delimiter).filter(Boolean));
  return dirs;
}

/**
 * Load, validate, and return all community templates.
 * Invalid manifests emit a warning and are skipped rather than thrown.
 */
export async function listCommunityTemplates(): Promise<CatalogTemplate[]> {
  const dirs = communityTemplateDirs();
  const templates: CatalogTemplate[] = [];

  for (const dir of dirs) {
    if (!(await fs.pathExists(dir))) continue;
    const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = await fs.readJson(path.join(dir, file));
        const parsed = CatalogTemplateSchema.parse(raw);
        templates.push(parsed);
      } catch (e: any) {
        logger.warn(`Community template "${file}" is invalid and was skipped: ${e?.message || String(e)}`);
      }
    }
  }

  return templates.sort((a, b) => a.id.localeCompare(b.id));
}
