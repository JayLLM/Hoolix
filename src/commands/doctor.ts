import path from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import { VERSION } from '../core/version.js';
import { ensureDirectories } from '../core/paths.js';
import { loadConfig } from '../core/config.js';
import { listServers } from '../core/registry.js';
import { getServerDataDir, getServerCredentialsPath } from '../core/paths.js';
import { listTemplates } from '../app/services/catalog.js';
import { listSourcePlugins } from '../sources/plugins.js';
import { getCommunityTemplateDir } from '../catalog/community.js';
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
    const scheduled = servers.filter((s) => s.reindexSchedule?.enabled).length;
    let rateStates = 0;
    for (const s of servers) {
      if (await fs.pathExists(path.join(getServerDataDir(s.slug), 'rate-state.json'))) rateStates++;
    }
    results.servers = { count: servers.length, slugs: servers.map((s) => s.slug), scheduledReindex: scheduled, persistedRateStates: rateStates };
    checks.push({ name: 'registry', ok: true, detail: `${servers.length} server(s)` });
    checks.push({ name: 'scheduled-reindex', ok: true, detail: `${scheduled} enabled` });
    checks.push({ name: 'rate-state', ok: true, detail: `${rateStates} persisted state file(s)` });
  } catch (e: any) {
    checks.push({ name: 'registry', ok: false, detail: e.message });
    results.servers = { error: e.message };
  }

  checks.push({ name: 'process-manager', ok: true });
  checks.push({ name: 'stdio-transport', ok: true, detail: 'hoolix start <slug> --transport stdio' });

  try {
    const templates = await listTemplates();
    results.catalog = { templates: templates.length, ids: templates.map((t) => t.id) };
    checks.push({ name: 'template-catalog', ok: templates.length > 0, detail: `${templates.length} template(s)` });
  } catch (e: any) {
    checks.push({ name: 'template-catalog', ok: false, detail: e.message || String(e) });
  }

  try {
    const plugins = await listSourcePlugins();
    results.sourcePlugins = { count: plugins.length, ids: plugins.map((plugin) => plugin.id) };
    checks.push({ name: 'source-plugins', ok: true, detail: `${plugins.length} custom provider(s)` });
  } catch (e: any) {
    checks.push({ name: 'source-plugins', ok: false, detail: e.message || String(e) });
  }

  // Community templates directory (informational — always ok)
  try {
    const communityDir   = getCommunityTemplateDir();
    const dirExists      = await fs.pathExists(communityDir);
    const communityFiles = dirExists
      ? (await fs.readdir(communityDir).catch(() => [])).filter((f: string) => f.endsWith('.json'))
      : [];
    results.communityTemplates = { dir: communityDir, count: communityFiles.length };
    checks.push({
      name: 'community-templates',
      ok:   true,
      detail: communityFiles.length > 0
        ? `${communityFiles.length} template(s) at ${communityDir}`
        : `none yet — add JSON files to ${communityDir}`,
    });
  } catch (e: any) {
    checks.push({ name: 'community-templates', ok: false, detail: e.message || String(e) });
  }

  // ── mcp-server runtime tools ────────────────────────────────────────────────
  // npx: required for filesystem, github-api, postgres, memory, and most npm-based templates
  try {
    execSync('npx --version', { stdio: 'ignore' });
    checks.push({ name: 'npx', ok: true, detail: 'available (required for npm-based MCP server templates)' });
  } catch {
    checks.push({ name: 'npx', ok: false, detail: 'not found — install Node.js to use filesystem/github-api/postgres/memory templates' });
  }

  // uvx: required for sqlite template (Python-based official MCP server)
  try {
    execSync(process.platform === 'win32' ? 'uvx --version 2>nul' : 'uvx --version', { stdio: 'ignore' });
    checks.push({ name: 'uvx', ok: true, detail: 'available (required for sqlite template)' });
  } catch {
    checks.push({ name: 'uvx', ok: false, detail: 'not found — install uv (https://docs.astral.sh/uv/) for the sqlite template' });
  }

  // ── credentials.json permission check (Unix only) ────────────────────────────
  if (process.platform !== 'win32') {
    const mcpServers = (results.servers as any)?.slugs as string[] | undefined ?? [];
    const loosePerm: string[] = [];
    for (const serverSlug of mcpServers) {
      const credPath = getServerCredentialsPath(serverSlug);
      if (await fs.pathExists(credPath)) {
        try {
          const stat = await fs.stat(credPath);
          if ((stat.mode & 0o777) !== 0o600) loosePerm.push(serverSlug);
        } catch {}
      }
    }
    if (loosePerm.length === 0) {
      checks.push({ name: 'credentials-perms', ok: true, detail: 'all credentials.json files are 0600' });
    } else {
      checks.push({ name: 'credentials-perms', ok: false, detail: `loose permissions on: ${loosePerm.join(', ')} — run: chmod 0600 ~/.local/share/hoolix/servers/<slug>/credentials.json` });
    }
  }

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
    printCommand('hoolix templates list');
    printCommand('hoolix start my-docs && hoolix connect my-docs --client cursor');
    printCommand('hoolix start my-docs --transport stdio --json');
  } else {
    console.log(`  ${ui.warning('!')} Some checks failed or are limited. See details above.`);
    console.log(`  ${ui.muted('Common fixes: ensure write access to data dir, check network for initial llms.txt fetches.')}`);
  }
  console.log('');
  console.log(`  ${ui.muted('Security:')} keys are per-server + rotatable; rate limits + audit.log enabled in host (see \`hoolix audit <slug>\`).`);
  console.log(`  ${ui.muted('Private sources:')} use --header "Authorization: Bearer <token>", --cookie "...", or GITHUB_TOKEN for private GitHub.`);

  if (!allOk) process.exit(1);
}
