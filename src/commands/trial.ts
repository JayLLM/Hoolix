import { createServer } from '../app/services/servers.js';
import { instantiateTemplate } from '../app/services/catalog.js';
import { getServerMetadata } from '../core/registry.js';
import { logger } from '../core/logger.js';
import { printCommand, printDetails, printJson, printSection, printTitle, ui } from '../ui/format.js';
import type { AppProgressEvent } from '../app/events.js';

const TRIAL_NAME = 'Hoolix Trial';
const TRIAL_SLUG = 'hoolix-trial';
const TRIAL_URL = 'https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md';

export async function cmdTrial(args: string[], json: boolean): Promise<void> {
  const force = args.includes('--yes') || args.includes('-y') || json;
  const existing = await getServerMetadata(TRIAL_SLUG).catch(() => null);
  if (existing) {
    if (json) {
      printJson({ ok: true, slug: TRIAL_SLUG, existed: true, next: [`hoolix verify ${TRIAL_SLUG} --json`, `hoolix start ${TRIAL_SLUG}`] });
      return;
    }
    printTitle('Trial Ready', `"${existing.name}" already exists.`);
    printCommand(`hoolix verify ${TRIAL_SLUG}`);
    printCommand(`hoolix start ${TRIAL_SLUG}`);
    return;
  }

  if (!force && !json) {
    logger.info('Creating a trial MCP server from a public Model Context Protocol README.');
  }

  const instantiated = await instantiateTemplate('docs-rag', { url: TRIAL_URL });
  let lastProgress = '';
  const result = await createServer({
    name: TRIAL_NAME,
    definition: instantiated.definition,
    embeddingModel: 'fuse',
    maxChunks: 1200,
    maxPages: 10,
    onProgress: (event: AppProgressEvent) => { lastProgress = event.message; },
  });

  if (json) {
    printJson({
      ok: true,
      slug: result.meta.slug,
      name: result.meta.name,
      sourceUrl: result.meta.sourceUrl,
      chunkCount: result.meta.chunkCount,
      template: result.meta.definition?.template,
      next: [`hoolix verify ${result.meta.slug} --json`, `hoolix start ${result.meta.slug}`, `hoolix connect ${result.meta.slug} --client cursor`],
    });
    return;
  }

  printTitle('Trial Created', 'Your first Hoolix MCP server is ready.');
  printDetails([
    ['Slug', result.meta.slug],
    ['Chunks', result.meta.chunkCount.toLocaleString()],
    ['Progress', lastProgress || 'complete'],
  ]);
  console.log('');
  printSection('Try it');
  printCommand(`hoolix verify ${result.meta.slug}`);
  printCommand(`hoolix start ${result.meta.slug}`);
  printCommand(`hoolix connect ${result.meta.slug} --client cursor`);
  console.log('');
  console.log(`  ${ui.muted('npx path:')} npx hoolix trial --json`);
}
