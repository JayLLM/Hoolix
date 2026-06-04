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
  const stripKey = args.includes('--strip-key') || !includeKey;
  const includeSourceAuth = args.includes('--include-source-auth');
  const team = args.includes('--team') || args.includes('--share');

  const chunksPath = path.join(dataDir, 'chunks.json');
  const embeddingsPath = path.join(dataDir, 'embeddings.json');
  const chunks = await fs.readJson(chunksPath).catch(() => []);
  const embeddings = await fs.readJson(embeddingsPath).catch(() => null);
  const exportedMeta = sanitizeMetadataForExport(meta, {
    stripKey,
    includeSourceAuth,
  });

  const bundle = {
    version: 2,
    exportedAt: new Date().toISOString(),
    compatibility: { minHoolixVersion: '0.0.1-beta.7' },
    sharing: {
      team,
      strippedKey: stripKey,
      strippedSourceAuth: !includeSourceAuth,
    },
    includeKey: !stripKey,
    metadata: exportedMeta,
    chunks,
    embeddings: team ? null : embeddings,
  };

  await fs.ensureDir(path.dirname(path.resolve(file)));
  await fs.writeJson(file, bundle, { spaces: 2 });

  if (json) {
    printJson({ ok: true, slug, file: path.resolve(file), chunks: Array.isArray(chunks) ? chunks.length : 0, includeKey: !stripKey, strippedSourceAuth: !includeSourceAuth, team });
    return;
  }

  printTitle('Exported', slug);
  printDetails([
    ['File',              path.resolve(file)],
    ['Chunks',            Array.isArray(chunks) ? chunks.length : 0],
    ['Auth key included', stripKey ? 'no' : 'yes'],
    ['Source auth included', includeSourceAuth ? 'yes' : 'no'],
    ['Team bundle', team ? 'yes (embeddings omitted)' : 'no'],
  ]);
  if (stripKey) {
    console.log(`  A fresh auth key will be generated on import.`);
  }
}

function sanitizeMetadataForExport(meta: any, opts: { stripKey: boolean; includeSourceAuth: boolean }) {
  const copy = { ...meta };
  if (opts.stripKey) copy.authKey = undefined;
  if (!opts.includeSourceAuth && copy.definition?.sources) {
    copy.definition = {
      ...copy.definition,
      sources: copy.definition.sources.map((source: any) => {
        const { headers: _headers, cookie: _cookie, ...rest } = source;
        return rest;
      }),
    };
  }
  return copy;
}
