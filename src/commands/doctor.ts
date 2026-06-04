import path from 'node:path';
import fs from 'fs-extra';
import { VERSION } from '../core/version.js';
import { ensureDirectories } from '../core/paths.js';
import { loadConfig } from '../core/config.js';
import { listServers } from '../core/registry.js';
import { printTitle, printCommand, printDetails, printJson, ui } from '../ui/format.js';

export async function cmdDoctor(json: boolean): Promise<void> {
  const results: Record<string, unknown> = {};
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  const execPath        = process.execPath;
  const isCompiledBinary = !execPath.includes('node') && !execPath.includes('bun') && !execPath.includes('tsx');
  const runtime         = isCompiledBinary ? 'compiled-binary (bun)' : execPath.includes('bun') ? 'bun' : 'node';
  const platform        = `${process.platform} ${process.arch}`;

  const runtimeInfo = {
    version:  VERSION,
    runtime,
    platform,
    execPath: execPath.slice(0, 120) + (execPath.length > 120 ? '...' : ''),
    node:     process.version,
  };
  results.runtime = runtimeInfo;
  checks.push({ name: 'runtime', ok: true, detail: `${runtime} on ${platform}` });

  try {
    const paths = await ensureDirectories();
    const testFile = path.join(paths.data, '.doctor-write-test');
    await fs.writeFile(testFile, 'ok');
    await fs.remove(testFile).catch(() => {});
    results.paths = { data: paths.data, config: paths.config, servers: paths.servers, cache: paths.cache, writable: true };
    checks.push({ name: 'paths', ok: true, detail: `data=${paths.data}` });
  } catch (e: any) {
    checks.push({ name: 'paths', ok: false, detail: e.message });
    results.paths = { error: e.message };
  }

  try {
    const cfg = await loadConfig();
    results.config = cfg;
    checks.push({ name: 'config', ok: true });
  } catch (e: any) {
    checks.push({ name: 'config', ok: false, detail: e.message });
  }

  try {
    const servers = await listServers();
    results.servers = { count: servers.length, slugs: servers.map((s) => s.slug) };
    checks.push({ name: 'registry', ok: true, detail: `${servers.length} server(s)` });
  } catch (e: any) {
    checks.push({ name: 'registry', ok: false, detail: e.message });
    results.servers = { error: e.message };
  }

  checks.push({ name: 'process-manager', ok: true });

  let netOk = false;
  try {
    const ctl = new AbortController();
    const t   = setTimeout(() => ctl.abort(), 3000);
    const r   = await fetch('https://api.github.com/zen', { signal: ctl.signal }).catch(() => null);
    clearTimeout(t);
    netOk = !!r && r.ok;
    checks.push({ name: 'network', ok: netOk, detail: netOk ? 'github reachable' : 'limited' });
  } catch {
    checks.push({ name: 'network', ok: false, detail: 'offline or blocked' });
  }
  results.network = { ok: netOk };

  const allOk = checks.every((c) => c.ok);
  results.checks  = checks;
  results.healthy = allOk;

  if (json) {
    printJson(results);
    if (!allOk) process.exit(1);
    return;
  }

  printTitle('Doctor', 'Installation, runtime, paths, and network checks.');
  printDetails([
    ['Version', VERSION],
    ['Runtime', `${runtime} (${platform})`],
    ['Exec',    runtimeInfo.execPath],
  ]);
  console.log('');

  for (const c of checks) {
    const icon = c.ok ? ui.success('✓') : ui.danger('✗');
    console.log(
      c.detail
        ? `  ${icon} ${c.name.padEnd(18)} ${ui.muted(c.detail)}`
        : `  ${icon} ${c.name}`
    );
  }

  console.log('');
  if (allOk) {
    console.log(`  ${ui.success('✓')} All checks passed. Installation looks healthy.`);
    printCommand('hoolix create "My Docs" --url https://example.com/llms.txt --yes');
    printCommand('hoolix start my-docs && hoolix connect my-docs --client cursor');
  } else {
    console.log(`  ${ui.warning('!')} Some checks failed or are limited. See details above.`);
    console.log(`  ${ui.muted('Common fixes: ensure write access to data dir, check network for initial llms.txt fetches.')}`);
  }
  console.log('');
  console.log(`  ${ui.muted('Security:')} keys are per-server + rotatable; rate limits + audit.log enabled in host (see \`hoolix audit <slug>\`).`);
  console.log(`  ${ui.muted('Private GitHub:')} export GITHUB_TOKEN for full raw+tree access on private repos (see docs).`);

  if (!allOk) process.exit(1);
}
