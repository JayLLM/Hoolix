/**
 * hoolix bundle export [slugs...] --output <file>
 * hoolix bundle import <file>
 *
 * Multi-server bundle: export multiple servers into a single .hoolix.json
 * file. Credentials are NEVER included — the bundle contains metadata and
 * chunks only. After import, `hoolix secrets set` commands are printed for
 * any mcp-server kind servers that require credentials.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { confirm, isCancel, cancel } from '@clack/prompts';
import { getServerMetadata, registerServer, slugify } from '../core/registry.js';
import { listRegisteredServers } from '../app/services/servers.js';
import { getServerDataDir } from '../core/paths.js';
import { logger } from '../core/logger.js';
import { generateAuthKey } from '../lib/auth.js';
import {
  printTitle, printSection, printDetails, printCommand, printJson,
  parseOption, ui,
} from '../ui/format.js';
import type { EmbeddingModel } from '../rag/models.js';

const BUNDLE_VERSION = 1;
const BUNDLE_TYPE    = 'multi-server-bundle';

// ── Export ────────────────────────────────────────────────────────────────────

async function bundleExport(args: string[], json: boolean): Promise<void> {
  // Collect slug args (non-flag args after 'export')
  const slugArgs: string[] = [];
  let i = 2; // args[0]=bundle, args[1]=export
  for (; i < args.length; i++) {
    if (args[i].startsWith('-')) break;
    slugArgs.push(args[i]);
  }

  const outputFile = parseOption(args, '--output') || parseOption(args, '--file') || 'bundle.hoolix.json';
  const exportAll  = args.includes('--all') || slugArgs.length === 0;
  const stripKey   = !args.includes('--include-key');
  const team       = args.includes('--team');

  // Resolve which slugs to export
  let slugsToExport: string[];
  if (exportAll) {
    const all = await listRegisteredServers();
    slugsToExport = all.map((s: any) => s.slug);
  } else {
    slugsToExport = slugArgs;
  }

  if (slugsToExport.length === 0) {
    if (json) printJson({ ok: false, error: 'No servers found. Usage: hoolix bundle export [slug...] [--output file]' });
    else logger.error('No servers registered. Usage: hoolix bundle export [slugs...] [--all] [--output <file>]');
    process.exit(1);
  }

  const bundleServers: Array<{
    slug: string;
    meta: unknown;
    chunks: unknown[];
    embeddings: unknown | null;
    credentialsNote?: unknown;
  }> = [];

  const errors: string[] = [];

  for (const slug of slugsToExport) {
    try {
      const meta    = await getServerMetadata(slug);
      const dataDir = getServerDataDir(slug);

      const chunks     = await fs.readJson(path.join(dataDir, 'chunks.json')).catch(() => []);
      const embeddings = team
        ? null
        : await fs.readJson(path.join(dataDir, 'embeddings.json')).catch(() => null);

      const exportedMeta = { ...meta } as any;
      if (stripKey) exportedMeta.authKey = undefined;
      // Never export credentials; remove credentialValues if somehow present
      delete exportedMeta.credentials;

      const isMcpServer = (meta as any).serverKind === 'mcp-server';
      const credentialKeys: string[] = isMcpServer ? ((meta as any).credentialKeys ?? []) : [];

      bundleServers.push({
        slug,
        meta: exportedMeta,
        chunks: Array.isArray(chunks) ? chunks : [],
        embeddings,
        ...(isMcpServer && credentialKeys.length > 0 ? {
          credentialsNote: {
            required: true,
            keys: credentialKeys,
            setup: `Credentials are not exported. After importing, run: hoolix secrets set ${slug} <key> for each key listed above.`,
          },
        } : {}),
      });
    } catch (e: any) {
      errors.push(`${slug}: ${e?.message || String(e)}`);
    }
  }

  if (bundleServers.length === 0) {
    if (json) printJson({ ok: false, error: 'No servers could be exported.', details: errors });
    else { logger.error('No servers could be exported.'); for (const err of errors) logger.warn(err); }
    process.exit(1);
  }

  const bundle = {
    version:       BUNDLE_VERSION,
    type:          BUNDLE_TYPE,
    exportedAt:    new Date().toISOString(),
    compatibility: { minHoolixVersion: '0.0.1-beta.16' },
    sharing:       { team, strippedKey: stripKey },
    serverCount:   bundleServers.length,
    servers:       bundleServers,
  };

  await fs.ensureDir(path.dirname(path.resolve(outputFile)));
  await fs.writeJson(outputFile, bundle, { spaces: 2 });

  if (json) {
    printJson({
      ok: true,
      file:        path.resolve(outputFile),
      serverCount: bundleServers.length,
      slugs:       bundleServers.map((s) => s.slug),
      errors:      errors.length > 0 ? errors : undefined,
    });
    return;
  }

  printTitle('Bundle exported', path.resolve(outputFile));
  printDetails([
    ['Servers',    bundleServers.length],
    ['File',       path.resolve(outputFile)],
    ['Auth keys',  stripKey ? 'stripped (fresh on import)' : 'included'],
    ['Team mode',  team ? 'yes (embeddings omitted)' : 'no'],
    ['Slugs',      bundleServers.map((s) => s.slug).join(', ')],
  ]);

  // Per-server credential notes
  const mcpWithCreds = bundleServers.filter((s) => s.credentialsNote);
  if (mcpWithCreds.length > 0) {
    console.log('');
    console.log(`  ${ui.warning('!')} Credentials are not included. After importing, run:`);
    for (const entry of mcpWithCreds) {
      const note = entry.credentialsNote as any;
      for (const key of (note?.keys ?? [])) {
        printCommand(`hoolix secrets set ${entry.slug} ${key}`);
      }
    }
  }

  if (errors.length > 0) {
    console.log('');
    console.log(`  ${ui.warning('!')} ${errors.length} server(s) skipped:`);
    for (const err of errors) logger.warn(`  ${err}`);
  }

  console.log('');
  printCommand(`hoolix bundle import ${path.resolve(outputFile)}`);
  console.log('');
}

// ── Import ────────────────────────────────────────────────────────────────────

async function bundleImport(args: string[], json: boolean): Promise<void> {
  // args[0]=bundle, args[1]=import, args[2]=<file> or --file <file>
  const file = args[2]?.startsWith('-') ? parseOption(args, '--file') : (args[2] || parseOption(args, '--file'));

  if (!file) {
    if (json) printJson({ ok: false, error: 'Usage: hoolix bundle import <file> [--yes]' });
    else logger.error('Usage: hoolix bundle import <file> [--yes] [--json]');
    process.exit(1);
  }

  const bundle = await fs.readJson(file).catch((e: any) => {
    throw new Error(`Could not read bundle file: ${e.message || e}`);
  });

  if (!bundle || bundle.type !== BUNDLE_TYPE || !Array.isArray(bundle.servers)) {
    if (json) printJson({ ok: false, file, error: 'Not a valid hoolix multi-server bundle (missing type or servers array).' });
    else logger.error('Not a valid hoolix multi-server bundle. Use hoolix import for single-server bundles.');
    process.exit(1);
  }

  const force = args.includes('--yes') || args.includes('-y') || json;

  if (!force) {
    const count = bundle.servers.length;
    const confirmed = await confirm({
      message: `Import ${count} server${count !== 1 ? 's' : ''} from "${path.basename(file)}"?`,
    });
    if (isCancel(confirmed) || !confirmed) {
      cancel('Import cancelled');
      return;
    }
  }

  const imported: string[] = [];
  const skipped:  string[] = [];
  const allCredCommands: string[] = [];

  for (const entry of bundle.servers) {
    const { slug: origSlug, meta: importedMeta, chunks, embeddings } = entry;

    try {
      // Check for slug collision
      const existingSlug = origSlug || slugify((importedMeta as any).name || 'imported');
      const exists = await getServerMetadata(existingSlug).then(() => true).catch(() => false);
      const slug = exists ? `${existingSlug}-imported` : existingSlug;

      if (exists) {
        logger.warn(`Server "${existingSlug}" already exists — importing as "${slug}"`);
      }

      const authKey =
        typeof (importedMeta as any).authKey === 'string' && (importedMeta as any).authKey.length >= 16
          ? (importedMeta as any).authKey
          : generateAuthKey();

      await registerServer({
        name:             (importedMeta as any).name || slug,
        slug,
        sourceUrl:        (importedMeta as any).sourceUrl,
        sourceType:       (importedMeta as any).sourceType || 'manual',
        ingestionVersion: (importedMeta as any).ingestionVersion || '1.0.0',
        embeddingModel:   ((importedMeta as any).embeddingModel || 'fuse') as EmbeddingModel,
        chunkCount:       Array.isArray(chunks) ? chunks.length : 0,
        ingestionStats:   (importedMeta as any).ingestionStats,
        vectorIndexed:    !!embeddings,
        authKey,
        desiredState:     'stopped',
        serverKind:       (importedMeta as any).serverKind ?? 'docs-rag',
        credentialKeys:   (importedMeta as any).credentialKeys ?? [],
        definition:       (importedMeta as any).definition,
      });

      const dataDir = getServerDataDir(slug);
      await fs.ensureDir(dataDir);
      if (Array.isArray(chunks)) {
        await fs.writeJson(path.join(dataDir, 'chunks.json'), chunks, { spaces: 2 });
      }
      if (embeddings) {
        await fs.writeJson(path.join(dataDir, 'embeddings.json'), embeddings, { spaces: 2 });
      }

      imported.push(slug);

      // Collect credential commands for mcp-server kind
      const credKeys = (importedMeta as any).credentialKeys as string[] | undefined;
      if ((importedMeta as any).serverKind === 'mcp-server' && credKeys && credKeys.length > 0) {
        for (const key of credKeys) {
          allCredCommands.push(`hoolix secrets set ${slug} ${key}`);
        }
      }
    } catch (e: any) {
      skipped.push(`${origSlug || 'unknown'}: ${e?.message || String(e)}`);
    }
  }

  if (json) {
    printJson({
      ok:       true,
      imported,
      skipped,
      file:     path.resolve(file),
      ...(allCredCommands.length > 0 ? {
        credentialsRequired: true,
        next: allCredCommands,
      } : {}),
    });
    return;
  }

  printTitle('Bundle imported', `${imported.length} server${imported.length !== 1 ? 's' : ''}`);
  printDetails([
    ['File',     path.resolve(file)],
    ['Imported', imported.join(', ') || '(none)'],
    ...(skipped.length > 0 ? [['Skipped', skipped.length] as [string, number]] : []),
  ]);

  if (allCredCommands.length > 0) {
    console.log('');
    console.log(`  ${ui.warning('!')} Credentials are not stored in bundles. Add them now:`);
    for (const cmd of allCredCommands) {
      printCommand(cmd);
    }
    console.log(`  ${ui.muted('(prompts securely if value is omitted)')}`);
  }

  if (skipped.length > 0) {
    console.log('');
    console.log(`  ${ui.warning('!')} Skipped (${skipped.length}):`);
    for (const err of skipped) logger.warn(`  ${err}`);
  }

  console.log('');
  for (const slug of imported) {
    printCommand(`hoolix info ${slug}`);
  }
  console.log('');
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function cmdBundle(args: string[], json: boolean): Promise<void> {
  const sub = args[1];

  if (sub === 'export') {
    await bundleExport(args, json);
    return;
  }

  if (sub === 'import') {
    await bundleImport(args, json);
    return;
  }

  if (json) {
    printJson({ ok: false, error: 'Usage: hoolix bundle export|import' });
  } else {
    printTitle('Bundle', 'Export or import multiple servers at once.');
    printSection('Commands');
    printCommand('hoolix bundle export                           (all servers → bundle.hoolix.json)');
    printCommand('hoolix bundle export my-docs my-github --output team.hoolix.json');
    printCommand('hoolix bundle import team.hoolix.json --yes');
    console.log('');
    printDetails([
      ['Note', 'Credentials are never included in bundles.'],
      ['Note', 'After import, follow the printed `hoolix secrets set` instructions.'],
    ]);
    console.log('');
  }
}
