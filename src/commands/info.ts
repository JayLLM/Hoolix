import { validateServerState } from '../core/registry.js';
import { getServerInfo, getServerSourceLabel } from '../app/services/servers.js';
import { loadCredentials } from '../app/services/credentials.js';
import { getTemplate } from '../app/services/catalog.js';
import { interpolateRunConfig } from '../app/services/credentials.js';
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

  const { meta, status } = await getServerInfo(slug);
  const serverKind: 'docs-rag' | 'mcp-server' = meta.serverKind ?? 'docs-rag';

  const full = {
    ...meta,
    authKey:    maskSecret(meta.authKey),
    freshness:  getFreshness(meta.lastUpdatedAt),
    running:    status.running,
    port:       status.port,
    pid:        status.pid,
    serverKind,
  };

  if (json) {
    printJson(full);
    return;
  }

  if (serverKind === 'mcp-server') {
    await renderMcpServerInfo(slug, meta, status);
    return;
  }

  // ── docs-rag display (existing) ───────────────────────────────────────────
  printTitle('Server Info', `${meta.name} (${meta.slug})`);
  printDetails([
    [(meta.definition?.sources.length ?? 1) > 1 ? 'Sources' : 'Source',
      truncate((meta.definition?.sources.length ?? 1) > 1 ? getServerSourceLabel(meta) : meta.sourceUrl, 92)],
    ['Type',      meta.sourceType],
    ['Chunks',    meta.chunkCount.toLocaleString()],
    ['Index',     isHybridModel(meta.embeddingModel as any) ? `Hybrid (${meta.embeddingModel})` : 'Fuse.js'],
    ['Template',  meta.definition?.template ? `${meta.definition.template.name} (${meta.definition.template.id})` : undefined],
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

async function renderMcpServerInfo(slug: string, meta: any, status: any): Promise<void> {
  const templateId = meta.definition?.template?.id ?? 'unknown';
  const templateInputs: Record<string, string> = meta.definition?.template?.inputs ?? {};

  printTitle('Server Info', `${meta.name} (${meta.slug})`);
  printDetails([
    ['Kind',      'MCP server'],
    ['Template',  meta.definition?.template ? `${meta.definition.template.name} (${templateId})` : templateId],
    ['Status',    status.running ? ui.success('running') : ui.muted('stopped (use connect)')],
    ['Created',   new Date(meta.createdAt).toLocaleString()],
  ]);
  console.log('');

  // Load template for run config preview
  let template: Awaited<ReturnType<typeof getTemplate>> | null = null;
  try {
    template = await getTemplate(templateId);
  } catch {
    logger.warn(`Template "${templateId}" not found in catalog.`);
  }

  if (template?.server) {
    const credentials = await loadCredentials(slug);
    const substitutions = { ...templateInputs, ...credentials };
    const runConfig = interpolateRunConfig(template.server, substitutions);

    printSection('Run config (what your client executes)');
    printDetails([
      ['Transport', template.server.transport ?? 'stdio'],
      ['Command',   runConfig.command],
      ['Args',      runConfig.args.join(' ')],
      ...(template.server.npmPackage ? [['Package', template.server.npmPackage] as [string, string]] : []),
    ]);
    if (Object.keys(runConfig.env).length > 0) {
      const envDisplay = Object.entries(runConfig.env)
        .map(([k]) => `${k}=<set>`)
        .join(', ');
      printDetails([['Env vars', envDisplay]]);
    }
    console.log('');
  }

  // Inputs (non-sensitive)
  if (Object.keys(templateInputs).length > 0) {
    printSection('Template inputs');
    for (const [k, v] of Object.entries(templateInputs)) {
      console.log(`  ${ui.muted(k.padEnd(16))}  ${v}`);
    }
    console.log('');
  }

  // Credentials (key names only — values are never displayed)
  const credKeys: string[] = meta.credentialKeys ?? [];
  if (credKeys.length > 0) {
    printSection('Credentials stored');
    for (const key of credKeys) {
      console.log(`  ${ui.muted(key.padEnd(16))}  ${ui.success('✓ stored')} (credentials.json)`);
    }
    console.log('');
  } else if (template?.credentials.length) {
    const requiredCreds = template.credentials.filter((c: any) => c.required);
    if (requiredCreds.length > 0) {
      console.log(`  ${ui.warning('!')} No credentials stored. Re-create: hoolix delete ${slug} --yes && hoolix create "${meta.name}" --template ${templateId}`);
      console.log('');
    }
  }

  printSection('Next');
  printCommand(`hoolix connect ${slug}`);
  console.log(`  ${ui.muted('Your client will spawn the process automatically (stdio transport).')}`);
  console.log('');
}
