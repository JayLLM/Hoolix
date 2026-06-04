import path from 'node:path';
import fs from 'fs-extra';
import { getServerMetadata } from '../core/registry.js';
import { getServerDataDir } from '../core/paths.js';
import { printTitle, printDetails, printJson, parseOption } from '../ui/format.js';

export async function cmdExport(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix export <slug> --file <path>.' });
    else console.error('Usage: hoolix export <slug> [--file <path>] [--include-key] [--json]');
    process.exit(1);
  }

  const meta = await getServerMetadata(slug);
  const dataDir = getServerDataDir(slug);
  const file = parseOption(args, '--file') || `${slug}.hoolix.json`;
  const includeKey = args.includes('--include-key');

  const chunksPath = path.join(dataDir, 'chunks.json');
  const embeddingsPath = path.join(dataDir, 'embeddings.json');
  const chunks = await fs.readJson(chunksPath).catch(() => []);
  const embeddings = await fs.readJson(embeddingsPath).catch(() => null);
  const exportedMeta = includeKey ? meta : { ...meta, authKey: undefined };

  const bundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    includeKey,
    metadata: exportedMeta,
    chunks,
    embeddings,
  };

  await fs.ensureDir(path.dirname(path.resolve(file)));
  await fs.writeJson(file, bundle, { spaces: 2 });

  if (json) {
    printJson({ ok: true, slug, file: path.resolve(file), chunks: Array.isArray(chunks) ? chunks.length : 0, includeKey });
    return;
  }

  printTitle('Exported', slug);
  printDetails([
    ['File',              path.resolve(file)],
    ['Chunks',            Array.isArray(chunks) ? chunks.length : 0],
    ['Auth key included', includeKey ? 'yes' : 'no'],
  ]);
  if (!includeKey) {
    console.log(`  A fresh auth key will be generated on import.`);
  }
}
