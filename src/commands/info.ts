import { getServerMetadata, validateServerState } from '../core/registry.js';
import { serverManager } from '../process/manager.js';
import { logger } from '../core/logger.js';
import { isHybridModel } from '../rag/models.js';
import {
  printTitle, printSection, printDetails, printCommand, printJson,
  truncate, maskSecret, getFreshness, ui,
} from '../ui/format.js';

export async function cmdInfo(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
  if (!slug) {
    logger.error('Usage: hoolix info <slug> [--json]');
    process.exit(1);
  }

  const meta   = await getServerMetadata(slug);
  const status = await serverManager.getStatus(slug);

  const full = {
    ...meta,
    authKey:   maskSecret(meta.authKey),
    freshness: getFreshness(meta.lastUpdatedAt),
    running:   status.running,
    port:      status.port,
    pid:       status.pid,
  };

  if (json) {
    printJson(full);
    return;
  }

  printTitle('Server Info', `${meta.name} (${meta.slug})`);
  printDetails([
    ['Source',    truncate(meta.sourceUrl, 92)],
    ['Type',      meta.sourceType],
    ['Chunks',    meta.chunkCount.toLocaleString()],
    ['Index',     isHybridModel(meta.embeddingModel as any) ? `Hybrid (${meta.embeddingModel})` : 'Fuse.js'],
    ['Freshness', getFreshness(meta.lastUpdatedAt).message],
    ['Status',    `${status.running ? ui.success('running') : ui.muted('stopped')}${status.port ? ` on :${status.port}` : ''}`],
    ['Created',   new Date(meta.createdAt).toLocaleString()],
  ]);
  if (status.running) {
    printDetails([['Auth', `Authorization: Bearer ${maskSecret(meta.authKey)}`]]);
  }
  console.log('');

  try {
    const v = await validateServerState(slug);
    if (!v.valid) {
      printSection('Validation');
      for (const issue of v.issues) {
        console.log(`  ${ui.warning('!')} ${issue}`);
      }
      console.log('');
      printCommand(`hoolix reindex ${slug}`);
    } else {
      console.log(`  ${ui.success('✓')} Validation ok`);
    }
  } catch {
    // ignore validation errors in info output
  }
}
