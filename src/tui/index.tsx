import fs from 'fs-extra';
import path from 'node:path';
import chalk from 'chalk';

import {
  listServers,
  type ServerMetadata,
} from '../core/registry.js';
import { serverManager, type ServerStatus } from '../process/manager.js';
import { getServerDir } from '../core/paths.js';
import { logger } from '../core/logger.js';

interface State {
  servers: ServerMetadata[];
  statuses: Record<string, ServerStatus>;
  selectedIndex: number;
  logTail: string[];
  actionStatus: string | null;
}

async function readLastLogLines(slug: string, n = 8): Promise<string[]> {
  const logPath = path.join(getServerDir(slug), 'host.log');
  try {
    const content = await fs.readFile(logPath, 'utf8');
    const lines = content.trim().split(/\r?\n/);
    return lines.slice(-n).filter(Boolean);
  } catch {
    return ['(no host.log yet — start the server)'];
  }
}

function renderUI(state: State) {
  console.clear();
  console.log(
    chalk.hex('#7dd3fc').bold('hoolix TUI') +
      chalk.dim('  (q quit • r refresh • 1-9 select • ↑↓ • s start/stop • v verify • c connect • i info • x reindex)')
  );

  const runningCount = Object.values(state.statuses).filter((s) => s.running).length;
  console.log(chalk.dim(`${state.servers.length} server(s) • ${runningCount} running`));

  if (state.servers.length === 0) {
    console.log('No servers yet. Run: hoolix create "Name" --url https://.../llms.txt --yes');
    return;
  }

  state.servers.forEach((s, i) => {
    const st = state.statuses[s.slug] || { running: false };
    const isSel = i === state.selectedIndex;
    const statusStr = st.running ? chalk.green('RUN') : chalk.gray('STOP');
    let line = `${i + 1}. ${s.slug.padEnd(18)} ${(s.name || '').slice(0, 22).padEnd(22)} ${statusStr} chunks=${s.chunkCount}`;
    if (isSel) {
      console.log(chalk.inverse(line));
    } else {
      console.log(line);
    }
  });

  if (state.actionStatus) {
    console.log('');
    state.actionStatus.split('\n').forEach((line) => {
      console.log(chalk.yellow(line));
    });
  }

  const selected = state.servers[state.selectedIndex];
  if (selected) {
    console.log('');
    console.log(chalk.dim('Selected: ') + selected.slug + (selected.name ? ` (${selected.name})` : ''));
    console.log(chalk.dim('Source: ') + selected.sourceUrl);
    console.log(chalk.dim('Recent log:'));
    state.logTail.forEach((l) => console.log(chalk.gray('  ' + l.slice(0, 90))));
  }

  console.log('');
  console.log(chalk.dim('Tip: Full keyboard in supported terminals. Use CLI commands for maximum power and scripting.'));
}

function maskSecret(value: string, visible = 6): string {
  if (!value) return '';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process');
    const input = text;
    if (process.platform === 'win32') {
      execSync('clip', { input, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
    if (process.platform === 'darwin') {
      execSync('pbcopy', { input, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
    try {
      execSync('xclip -selection clipboard', { input, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    } catch {}
    execSync('wl-copy', { input, stdio: ['pipe', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

export async function launchTUI(): Promise<void> {
  const testMode = process.env.MCP_PORTAL_TUI_TEST_MODE === '1';
  if (!testMode && (process.env.CI || !process.stdout.isTTY || !process.stdin.isTTY)) {
    console.log('hoolix TUI requires an interactive TTY (not CI or piped stdin/stdout).');
    console.log('Use the regular CLI commands instead: hoolix --help');
    return;
  }

  // Probe raw mode capability BEFORE doing anything heavy.
  let probeOk = false;
  try {
    if ((process.stdin as any).isTTY) {
      (process.stdin as any).setRawMode(true);
      (process.stdin as any).setRawMode(false);
      probeOk = true;
    }
  } catch {
    probeOk = false;
  }

  if (!testMode && !probeOk) {
    console.log('TUI requires a terminal that supports raw mode for keyboard input.');
    console.log('Falling back to help text. You can still use all CLI commands.');
    return;
  }

  const state: State = {
    servers: [],
    statuses: {},
    selectedIndex: 0,
    logTail: [],
    actionStatus: null,
  };

  let poll: NodeJS.Timeout | null = null;
  let dataHandler: ((key: string) => Promise<void>) | null = null;

  function doRender() {
    renderUI(state);
  }

  async function doRefresh() {
    try {
      state.servers = await listServers();
      state.statuses = {};
      for (const s of state.servers) {
        try {
          state.statuses[s.slug] = await serverManager.getStatus(s.slug);
        } catch {
          state.statuses[s.slug] = { running: false };
        }
      }
      if (state.servers.length > 0) {
        state.selectedIndex = Math.min(state.selectedIndex, state.servers.length - 1);
        const sel = state.servers[state.selectedIndex];
        state.logTail = await readLastLogLines(sel.slug, 8);
      } else {
        state.logTail = [];
      }
      doRender();
    } catch (e: any) {
      logger.debug('TUI refresh error', e?.message);
    }
  }

  async function performAction(key: string) {
    if (state.servers.length === 0) return;
    const idx = state.selectedIndex;
    const sel = state.servers[idx];
    const slug = sel.slug;

    state.actionStatus = `Processing ${key.toUpperCase()} for ${slug}...`;
    doRender();

    try {
      if (key === 's') {
        const st = state.statuses[slug] || { running: false };
        if (st.running) {
          await serverManager.stop(slug);
          state.actionStatus = `Stopped ${slug}`;
        } else {
          // Need metadata for the auth key
          const { getServerMetadata } = await import('../core/registry.js');
          const meta = await getServerMetadata(slug);
          const port = 3456 + Math.floor(Math.random() * 400);
          await serverManager.start(slug, { port, authKey: meta.authKey });
          state.actionStatus = `Started ${slug} on :${port}`;
        }
      } else if (key === 'x') {
        const { ingestDocumentation } = await import('../ingestion/pipeline.js');
        const { createRAGForServer } = await import('../rag/store.js');
        const { updateServerMetadata, getServerMetadata } = await import('../core/registry.js');
        const m = await getServerMetadata(slug);
        if (!m.sourceUrl) throw new Error('no sourceUrl recorded for reindex');
        const res = await ingestDocumentation(m.sourceUrl, { maxChunks: 6000, maxPages: 80 });
        const r = await createRAGForServer(slug, (m as any).embeddingModel || 'fuse');
        await r.indexChunks(res.chunks);
        await updateServerMetadata(slug, { chunkCount: res.stats.totalChunks, ingestionStats: res.stats });
        state.actionStatus = `Reindexed ${slug} (${res.stats.totalChunks} chunks)`;
      } else if (key === 'v') {
        const { createRAGForServer } = await import('../rag/store.js');
        const r = await createRAGForServer(slug);
        const sres = await r.search('overview', { limit: 1 });
        state.actionStatus = sres.length
          ? `Verify: ${sres[0].metadata.url || sres[0].metadata.title || 'hit'}`
          : 'Verify: no results';
      } else if (key === 'c' || key === 'i') {
        const { getServerMetadata } = await import('../core/registry.js');
        const meta = await getServerMetadata(slug);
        const st = state.statuses[slug] || { port: 3456 };
        const p = st.port || 3456;
        const payload = {
          mcpServers: {
            [slug]: {
              type: 'streamable-http',
              url: `http://127.0.0.1:${p}/mcp`,
              headers: { Authorization: `Bearer ${meta.authKey}` },
            },
          },
        };
        const json = JSON.stringify(payload, null, 2);
        const maskedPayload = {
          mcpServers: {
            [slug]: {
              type: 'streamable-http',
              url: `http://127.0.0.1:${p}/mcp`,
              headers: { Authorization: `Bearer ${maskSecret(meta.authKey)}` },
            },
          },
        };
        state.actionStatus = `MCP config for ${slug}:\n${JSON.stringify(maskedPayload, null, 2)}`;
        const copied = await copyToClipboard(json);
        if (copied) {
          state.actionStatus += '\n(copied full token config to clipboard)';
        }
      }
    } catch (e: any) {
      state.actionStatus = `Error: ${e?.message || e}`;
    }

    await doRefresh();

    setTimeout(() => {
      state.actionStatus = null;
      doRender();
    }, 2200);
  }

  // Initial load
  await doRefresh();
  doRender();

  dataHandler = async (key: string) => {
    if (key === '\u0003' || key.toLowerCase() === 'q') {
      // Ctrl-C or q
      cleanup();
      console.clear();
      process.exit(0);
      return;
    }

    if (key.toLowerCase() === 'r') {
      await doRefresh();
      return;
    }

    if (/^[0-9]$/.test(key)) {
      const idx = parseInt(key, 10) - 1;
      if (idx >= 0 && idx < state.servers.length) {
        state.selectedIndex = idx;
        const sel = state.servers[idx];
        state.logTail = await readLastLogLines(sel.slug, 8);
        doRender();
      }
      return;
    }

    const lower = key.toLowerCase();
    if (['s', 'v', 'c', 'i', 'x'].includes(lower)) {
      await performAction(lower);
      return;
    }

    // Arrow keys
    if (key === '\u001b[A') {
      // Up
      if (state.servers.length > 0) {
        state.selectedIndex = Math.max(0, state.selectedIndex - 1);
        const sel = state.servers[state.selectedIndex];
        state.logTail = await readLastLogLines(sel.slug, 8);
        doRender();
      }
      return;
    }
    if (key === '\u001b[B') {
      // Down
      if (state.servers.length > 0) {
        state.selectedIndex = Math.min(state.servers.length - 1, state.selectedIndex + 1);
        const sel = state.servers[state.selectedIndex];
        state.logTail = await readLastLogLines(sel.slug, 8);
        doRender();
      }
      return;
    }
  };

  if (testMode) {
    const scriptedKeys = (process.env.MCP_PORTAL_TUI_KEYS || 'r,q')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean);
    for (const key of scriptedKeys) {
      if (key.toLowerCase() === 'q') break;
      await dataHandler(key);
    }
    cleanup();
    return;
  }

  // Enable raw mode for real input
  (process.stdin as any).setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', dataHandler);

  // Periodic status refresh (non-blocking)
  poll = setInterval(() => {
    doRefresh().catch(() => {});
  }, 2200);

  function cleanup() {
    if (poll) {
      clearInterval(poll);
      poll = null;
    }
    if (dataHandler) {
      process.stdin.removeListener('data', dataHandler);
      dataHandler = null;
    }
    try {
      (process.stdin as any).setRawMode(false);
    } catch {}
    process.stdin.pause();
  }

  // Best effort cleanup on signals
  const onSig = () => {
    cleanup();
    console.clear();
    process.exit(0);
  };
  process.once('SIGINT', onSig);
  process.once('SIGTERM', onSig);

  // Keep the event loop alive via the stdin listener
}

// For the main CLI to call
// (the function is already exported above)
