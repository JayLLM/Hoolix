import path from 'node:path';
import fs from 'fs-extra';
import { confirm, isCancel, cancel } from '@clack/prompts';
import { getServerMetadata, registerServer, slugify } from '../core/registry.js';
import { getServerDataDir } from '../core/paths.js';
import { logger } from '../core/logger.js';
import { generateAuthKey } from '../lib/auth.js';
import { printTitle, printDetails, printCommand, printJson, truncate, maskSecret, parseOption } from '../ui/format.js';
import type { EmbeddingModel } from '../rag/models.js';

export async function cmdImport(args: string[], json: boolean): Promise<void> {
  const file = parseOption(args, '--file') || args[1];
  if (!file) {
    if (json) printJson({ ok: false, error: 'Missing file. Next: pass hoolix import --file <bundle.hoolix.json>.' });
    else logger.error('Usage: hoolix import --file <path> [--slug <slug>] [--yes] [--json]');
    process.exit(1);
  }

  const bundle = await fs.readJson(file).catch((e: any) => {
    throw new Error(`Could not read import file: ${e.message || e}`);
  });

  if (!bundle || bundle.version !== 1 || !bundle.metadata || !Array.isArray(bundle.chunks)) {
    if (json) printJson({ ok: false, file, error: 'Invalid hoolix export bundle.' });
    else logger.error('Invalid hoolix export bundle.');
    process.exit(1);
  }

  const importedMeta = bundle.metadata;
  const slug = parseOption(args, '--slug') || importedMeta.slug || slugify(importedMeta.name || 'imported-docs');
  const exists = await getServerMetadata(slug).then(() => true).catch(() => false);
  if (exists) {
    if (json) printJson({ ok: false, slug, error: 'Server already exists. Next: pass --slug <new-slug> or delete the existing server.' });
    else logger.error(`Server "${slug}" already exists. Pass --slug <new-slug> or delete it first.`);
    process.exit(1);
  }

  const force = args.includes('--yes') || args.includes('-y') || json;
  if (!force) {
    const confirmed = await confirm({ message: `Import "${importedMeta.name || slug}" as ${slug}?` });
    if (isCancel(confirmed) || !confirmed) {
      cancel('Import cancelled');
      return;
    }
  }

  const authKey =
    typeof importedMeta.authKey === 'string' && importedMeta.authKey.length >= 16
      ? importedMeta.authKey
      : generateAuthKey();

  const meta = await registerServer({
    name:             importedMeta.name || slug,
    slug,
    sourceUrl:        importedMeta.sourceUrl,
    sourceType:       importedMeta.sourceType || 'manual',
    ingestionVersion: importedMeta.ingestionVersion || '1.0.0',
    embeddingModel:   (importedMeta.embeddingModel || 'fuse') as EmbeddingModel,
    chunkCount:       bundle.chunks.length,
    ingestionStats:   importedMeta.ingestionStats,
    vectorIndexed:    !!bundle.embeddings,
    authKey,
    desiredState:     'stopped',
  });

  const dataDir = getServerDataDir(slug);
  await fs.ensureDir(dataDir);
  await fs.writeJson(path.join(dataDir, 'chunks.json'), bundle.chunks, { spaces: 2 });
  if (bundle.embeddings) {
    await fs.writeJson(path.join(dataDir, 'embeddings.json'), bundle.embeddings, { spaces: 2 });
  }

  if (json) {
    printJson({ ok: true, slug, name: meta.name, chunks: bundle.chunks.length, authKey: maskSecret(authKey) });
    return;
  }

  printTitle('Imported', `${meta.name} (${slug})`);
  printDetails([
    ['Chunks',    bundle.chunks.length],
    ['Source',    truncate(meta.sourceUrl, 92)],
    ['Auth key',  bundle.includeKey ? 'preserved from export' : 'generated fresh'],
  ]);
  printCommand(`hoolix verify ${slug}`);
}
