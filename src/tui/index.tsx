/**
 * Hoolix TUI — polished pure-Node terminal dashboard.
 *
 * Layout:
 *   ┌─ header (brand + stats + version) ────────────────────────────────────┐
 *   │ Server list (left)           │ Detail panel (right)                    │
 *   │  ▶ 1  slug  [●RUN :3456]    │  Name      My Docs                      │
 *   │    2  other [○STOP]         │  Source    https://...                   │
 *   ├─────────────────────────────┴──────────────────────────────────────────┤
 *   │ Log tail (last N lines of host.log for selected server)                │
 *   ├────────────────────────────────────────────────────────────────────────┤
 *   │ Key help                                                                │
 *   │ Action status                                                           │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * Constraints (from AGENTS.md):
 *   - Pure Node, no Ink/React
 *   - Dynamically imported only (TTY/raw-mode guard in index.ts)
 *   - Never console.log from library code — only here in the TUI layer
 */

import fs from 'fs-extra';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { listServers, getServerMetadata, type ServerMetadata } from '../core/registry.js';
import { serverManager, type ServerStatus } from '../process/manager.js';
import { getServerDir } from '../core/paths.js';
import { logger } from '../core/logger.js';
import { VERSION } from '../core/version.js';
import { getServerSourceLabel, reindexServer, verifyServer } from '../app/services/servers.js';

// ── ANSI helpers ────────────────────────────────────────────────────────────

const A = {
  reset:     '\x1b[0m',
  bold:      '\x1b[1m',
  dim:       '\x1b[2m',
  green:     '\x1b[32m',
  cyan:      '\x1b[36m',
  yellow:    '\x1b[33m',
  red:       '\x1b[31m',
  gray:      '\x1b[90m',
  white:     '\x1b[97m',
  bgSelected: '\x1b[48;2;15;52;80m',   // dark steel-blue for selection
  clear:     '\x1b[2J\x1b[H',
  // Brand accent matches CLI ui.accent (hex #7dd3fc → closest 256-color: 117)
  brand:     '\x1b[38;5;117m',
};

// ── Box-drawing ──────────────────────────────────────────────────────────────

const B = {
  h: '─', v: '│',
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  ml: '├', mr: '┤', mt: '┬', mb: '┴',
  run:  '●',
  stop: '○',
  sel:  '▶',
  dot:  '·',
};

// ── State ────────────────────────────────────────────────────────────────────

interface TUIState {
  servers:       ServerMetadata[];
  statuses:      Record<string, ServerStatus>;
  selectedIndex: number;
  logTail:       string[];
  actionMsg:     string | null;
  actionIsError: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

function maskKey(value: string, visible = 6): string {
  if (!value) return '';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

function freshnessLabel(lastUpdatedAt: string): string {
  const updated = Date.parse(lastUpdatedAt);
  if (!Number.isFinite(updated)) return 'unknown';
  const ageDays = Math.max(0, Math.floor((Date.now() - updated) / 86400000));
  if (ageDays === 0) return 'today';
  if (ageDays === 1) return '1d old';
  if (ageDays < 14)  return `${ageDays}d old`;
  if (ageDays < 30)  return `${ageDays}d (aging)`;
  return `${ageDays}d (stale!)`;
}

async function readLastLogLines(slug: string, n = 6): Promise<string[]> {
  try {
    const content = await fs.readFile(path.join(getServerDir(slug), 'host.log'), 'utf8');
    const lines   = content.trim().split(/\r?\n/);
    return lines.slice(-n).filter(Boolean);
  } catch {
    return ['(no host.log yet — start the server to see logs)'];
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      execSync('clip', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
    if (process.platform === 'darwin') {
      execSync('pbcopy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
    try {
      execSync('xclip -selection clipboard', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    } catch {}
    execSync('wl-copy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

// ── Renderer ─────────────────────────────────────────────────────────────────

const LOG_LINES  = 5;
const MIN_WIDTH  = 72;
const MIN_HEIGHT = 18;

function buildFrame(state: TUIState): string {
  const W  = Math.max(MIN_WIDTH,  process.stdout.columns || 80);
  const H  = Math.max(MIN_HEIGHT, process.stdout.rows    || 24);

  // Column layout: left panel ~40% of width
  const innerW  = W - 2;                          // inside the outer border
  const leftW   = Math.min(40, Math.floor(W * 0.42));
  const rightW  = innerW - leftW - 1;             // −1 for the column divider │

  const out: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  const runningCount = Object.values(state.statuses).filter((s) => s.running).length;
  const statsStr  = `${state.servers.length} server${state.servers.length !== 1 ? 's' : ''} · ${runningCount} running`;
  const verStr    = `v${VERSION}`;
  const brandStr  = `◆ hoolix`;
  // Visible header content: ' brandStr  statsStr '
  const headerPad = innerW - brandStr.length - 2 - statsStr.length - verStr.length - 2;
  const headerLine =
    ` ${A.brand}${A.bold}${brandStr}${A.reset}  ${A.dim}${statsStr}${A.reset}` +
    ' '.repeat(Math.max(1, headerPad)) +
    `${A.dim}${verStr}${A.reset} `;

  out.push(`${B.tl}${B.h.repeat(innerW)}${B.tr}`);
  out.push(`${B.v}${headerLine}${B.v}`);

  // ── Column divider (after header) ─────────────────────────────────────────
  out.push(`${B.ml}${B.h.repeat(leftW)}${B.mt}${B.h.repeat(rightW)}${B.mr}`);

  // ── Main area: calculate how many rows we have ────────────────────────────
  // Fixed lines: 3 (top border + header + col-divider)
  //            + 1 (mid-divider between main and log)
  //            + LOG_LINES
  //            + 1 (log divider)
  //            + 1 (key help)
  //            + 1 (action status)
  //            + 1 (bottom border)
  const fixedRows = 3 + 1 + LOG_LINES + 1 + 1 + 1 + 1;
  const mainRows  = Math.max(3, H - fixedRows);

  // ── Build left-column lines (visible text + colored text tracked separately)
  const leftRaw: string[]     = [];
  const leftColored: string[] = [];

  if (state.servers.length === 0) {
    const r1 = pad(' No servers yet.', leftW);
    const r2 = pad('', leftW);
    const r3 = pad(` ${B.dot} n  copy create command`, leftW);
    const r4 = pad(` ${B.dot} r  refresh`, leftW);
    leftRaw.push(r1, r2, r3, r4);
    leftColored.push(
      ` ${A.dim}No servers yet.${A.reset}` + ' '.repeat(Math.max(0, leftW - 16)),
      r2,
      ` ${A.cyan}${B.dot}${A.reset} ${A.dim}n${A.reset}  copy create command` + ' '.repeat(Math.max(0, leftW - 22)),
      ` ${A.cyan}${B.dot}${A.reset} ${A.dim}r${A.reset}  refresh` + ' '.repeat(Math.max(0, leftW - 12)),
    );
  } else {
    for (let i = 0; i < state.servers.length && leftRaw.length < mainRows; i++) {
      const s  = state.servers[i];
      const st = state.statuses[s.slug] || { running: false };
      const isSel = i === state.selectedIndex;

      const numStr  = `${i + 1}`.padStart(2);
      const dotChar = st.running ? B.run : B.stop;
      const slug    = clip(s.slug, leftW - 16).padEnd(Math.min(18, leftW - 16));
      const portStr = st.running && st.port ? `:${st.port}` : '';
      const portPad = portStr.padEnd(7);

      // Raw visible line (for width measurement)
      const rawLine = ` ${isSel ? B.sel : ' '} ${numStr} ${dotChar} ${slug} ${portPad}`;
      const rawPadded = pad(rawLine, leftW);
      leftRaw.push(rawPadded);

      // Colored version
      const selArrow = isSel ? `${A.brand}${B.sel}${A.reset}` : ' ';
      const dotColor = st.running ? `${A.green}${dotChar}${A.reset}` : `${A.gray}${dotChar}${A.reset}`;
      const portColor = st.running && portStr ? `${A.green}${portPad}${A.reset}` : `${A.dim}${portPad}${A.reset}`;
      let colored = ` ${selArrow} ${A.dim}${numStr}${A.reset} ${dotColor} ${slug} ${portColor}`;

      if (isSel) {
        // bg-highlight the entire row
        colored = `${A.bgSelected}${colored}${' '.repeat(Math.max(0, leftW - rawLine.length))}${A.reset}`;
      } else {
        colored += ' '.repeat(Math.max(0, leftW - rawLine.length));
      }
      leftColored.push(colored);
    }
  }

  // Pad left column to mainRows
  while (leftRaw.length < mainRows) {
    leftRaw.push(' '.repeat(leftW));
    leftColored.push(' '.repeat(leftW));
  }

  // ── Build right-column lines ───────────────────────────────────────────────
  const rightRaw: string[]     = [];
  const rightColored: string[] = [];

  const sel = state.servers[state.selectedIndex];
  if (sel) {
    const st = state.statuses[sel.slug] || { running: false };

    const addRow = (label: string, value: string, valueColor = (v: string) => v) => {
      const l      = pad(label, 12);
      const v      = clip(value, rightW - 14);
      const vPad   = pad(v, rightW - 14);
      rightRaw.push(` ${l}  ${vPad}`);
      rightColored.push(` ${A.dim}${l}${A.reset}  ${valueColor(vPad)}`);
    };

    const blank = () => {
      rightRaw.push('');
      rightColored.push('');
    };

    addRow('Name',    sel.name || sel.slug);
    addRow('Slug',    sel.slug);
    addRow((sel.definition?.sources.length ?? 1) > 1 ? 'Sources' : 'Source', (sel.definition?.sources.length ?? 1) > 1 ? getServerSourceLabel(sel) : (sel.sourceUrl || '—'));
    addRow('Chunks',  sel.chunkCount.toLocaleString());
    addRow('Index',   sel.embeddingModel === 'fuse' ? 'Fuse.js' : `Hybrid (${sel.embeddingModel})`);
    if (sel.definition?.template) addRow('Template', sel.definition.template.name);
    addRow('Fresh',   freshnessLabel(sel.lastUpdatedAt));
    addRow(
      'Status',
      st.running ? `running on :${st.port || '?'}` : 'stopped',
      (v) => st.running ? `${A.green}${v}${A.reset}` : `${A.gray}${v}${A.reset}`,
    );

    if (st.running) {
      blank();
      const mcpUrl     = `http://127.0.0.1:${st.port}/mcp`;
      const urlLine    = clip(`URL  ${mcpUrl}`, rightW - 2);
      rightRaw.push(` ${pad(urlLine, rightW - 2)}`);
      rightColored.push(` ${A.dim}URL  ${A.reset}${A.cyan}${clip(mcpUrl, rightW - 7)}${A.reset}`);

      // Show masked auth key
      let authKeyStr = '—';
      try {
        // We have the metadata in sel, but authKey lives there
        authKeyStr = maskKey((sel as any).authKey || '');
      } catch {}
      addRow('Auth', `Bearer ${authKeyStr}`);
    }

    blank();
    // Keyboard hint for quick copy
    const hintLine = pad(` ${B.dot} Press c to copy MCP config to clipboard`, rightW);
    rightRaw.push(hintLine);
    rightColored.push(` ${A.dim}${B.dot} Press ${A.reset}${A.cyan}c${A.reset}${A.dim} to copy MCP config to clipboard${A.reset}` + ' '.repeat(Math.max(0, rightW - 42)));
  } else if (state.servers.length === 0) {
    const lines = [
      '  Get started:',
      '',
      `  1. hoolix create "My Docs" --url https://.../llms.txt --yes`,
      `  2. hoolix templates list`,
      `  3. hoolix verify my-docs`,
      `  4. hoolix start my-docs`,
      `  5. hoolix connect my-docs --client cursor`,
      '',
      `  ${B.dot} Press n to copy the create command.`,
    ];
    for (const l of lines) {
      rightRaw.push(pad(l, rightW));
      rightColored.push(`${A.dim}${pad(l, rightW)}${A.reset}`);
    }
  }

  // Pad right column to mainRows
  while (rightRaw.length < mainRows) {
    rightRaw.push('');
    rightColored.push('');
  }

  // ── Merge columns into rows ────────────────────────────────────────────────
  for (let i = 0; i < mainRows; i++) {
    const lRaw = leftRaw[i]  || '';
    const rRaw = rightRaw[i] || '';
    const lCol = leftColored[i]  || '';
    const rCol = rightColored[i] || '';
    // Pad raw widths, then substitute colored
    const lPad = lCol + ' '.repeat(Math.max(0, leftW - lRaw.length));
    const rPad = rCol + ' '.repeat(Math.max(0, rightW - rRaw.length));
    out.push(`${B.v}${lPad}${B.v}${rPad}${B.v}`);
  }

  // ── Log divider + tail ────────────────────────────────────────────────────
  const logTitle = sel ? ` Log: ${sel.slug} ` : ' Log ';
  const logLeft  = B.h.repeat(3) + logTitle;
  const logRight = B.h.repeat(Math.max(0, innerW - logLeft.length));
  out.push(`${B.ml}${logLeft}${logRight}${B.mr}`);

  for (let i = 0; i < LOG_LINES; i++) {
    const line = state.logTail[i] || '';
    // Strip ANSI from log lines to avoid layout corruption
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
    const displayed = clip(clean, innerW - 2);
    const padded    = pad(` ${displayed}`, innerW);
    out.push(`${B.v}${A.dim}${padded}${A.reset}${B.v}`);
  }

  // ── Key help bar ──────────────────────────────────────────────────────────
  out.push(`${B.ml}${B.h.repeat(innerW)}${B.mr}`);

  const keyHelp = '↑↓/1-9 select · s start/stop · v verify · c connect · x reindex · n new · t templates · r refresh · q quit';
  const helpLine = pad(` ${keyHelp}`, innerW);
  out.push(`${B.v}${A.dim}${helpLine}${A.reset}${B.v}`);

  // ── Action status line ────────────────────────────────────────────────────
  const actionRaw = state.actionMsg
    ? clip(state.actionMsg.replace(/\n/g, '  '), innerW - 3)
    : '';
  const actionColor = state.actionIsError ? A.red : A.yellow;
  const actionPad   = state.actionMsg
    ? `${A.bold}${actionColor} › ${actionRaw}${A.reset}` + ' '.repeat(Math.max(0, innerW - actionRaw.length - 3))
    : ' '.repeat(innerW);
  out.push(`${B.v}${actionPad}${B.v}`);

  out.push(`${B.bl}${B.h.repeat(innerW)}${B.br}`);

  return A.clear + out.join('\n') + '\n';
}

// ── State management ──────────────────────────────────────────────────────────

async function refresh(state: TUIState): Promise<void> {
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
    state.selectedIndex = Math.min(state.selectedIndex, Math.max(0, state.servers.length - 1));
    const sel = state.servers[state.selectedIndex];
    state.logTail = sel ? await readLastLogLines(sel.slug) : [];
  } catch (e: any) {
    logger.debug('TUI refresh error', e?.message);
  }
}

function render(state: TUIState): void {
  process.stdout.write(buildFrame(state));
}

function setAction(state: TUIState, msg: string | null, isError = false): void {
  state.actionMsg     = msg;
  state.actionIsError = isError;
}

// ── Key handlers ──────────────────────────────────────────────────────────────

async function handleKey(key: string, state: TUIState): Promise<void> {
  const { servers, statuses } = state;
  const noServers             = servers.length === 0;
  const slug                  = servers[state.selectedIndex]?.slug;

  // ── Navigation ────────────────────────────────────────────────────────────
  if (/^[1-9]$/.test(key)) {
    const idx = parseInt(key, 10) - 1;
    if (idx < servers.length) {
      state.selectedIndex = idx;
      state.logTail = await readLastLogLines(servers[idx].slug);
    }
    return;
  }

  if (key === '[A' && !noServers) {   // ↑
    state.selectedIndex = Math.max(0, state.selectedIndex - 1);
    state.logTail = await readLastLogLines(servers[state.selectedIndex].slug);
    return;
  }
  if (key === '[B' && !noServers) {   // ↓
    state.selectedIndex = Math.min(servers.length - 1, state.selectedIndex + 1);
    state.logTail = await readLastLogLines(servers[state.selectedIndex].slug);
    return;
  }

  // ── Global actions ────────────────────────────────────────────────────────
  if (key.toLowerCase() === 'r') {
    setAction(state, 'Refreshing…');
    await refresh(state);
    setAction(state, null);
    return;
  }

  if (key.toLowerCase() === 'n') {
    const cmd    = 'hoolix create "My Docs" --url https://example.com/llms.txt --yes';
    const copied = await copyToClipboard(cmd);
    setAction(state, copied ? `Copied: ${cmd}` : `Run: ${cmd}`);
    setTimeout(() => { setAction(state, null); render(state); }, 3000);
    return;
  }

  if (key.toLowerCase() === 't') {
    const cmd    = 'hoolix templates list';
    const copied = await copyToClipboard(cmd);
    setAction(state, copied ? `Copied: ${cmd}` : `Run: ${cmd}`);
    setTimeout(() => { setAction(state, null); render(state); }, 3000);
    return;
  }

  // ── Server actions (require a selected server) ────────────────────────────
  if (!slug) return;

  if (key.toLowerCase() === 's') {
    const st = statuses[slug] || { running: false };
    if (st.running) {
      setAction(state, `Stopping ${slug}…`);
      render(state);
      try {
        await serverManager.stop(slug);
        setAction(state, `Stopped ${slug}`);
      } catch (e: any) {
        setAction(state, `Stop failed: ${e?.message || e}`, true);
      }
    } else {
      setAction(state, `Starting ${slug}…`);
      render(state);
      try {
        const meta  = await getServerMetadata(slug);
        const port  = 3456 + Math.floor(Math.random() * 400);
        const result = await serverManager.start(slug, { port, authKey: meta.authKey });
        setAction(state, `Started ${slug} on :${result.port}`);
      } catch (e: any) {
        setAction(state, `Start failed: ${e?.message || e}`, true);
      }
    }
    await refresh(state);
    setTimeout(() => { setAction(state, null); render(state); }, 2500);
    return;
  }

  if (key.toLowerCase() === 'v') {
    setAction(state, `Verifying ${slug}…`);
    render(state);
    try {
      const report = await verifyServer(slug, ['overview']);
      const top = report.samples[0]?.results[0];
      if (top) {
        setAction(state, `✓ Verify ok — top result: ${top.metadata.url || top.metadata.title || 'hit'}`);
      } else {
        setAction(state, 'Verify: no results (index may be empty)', true);
      }
    } catch (e: any) {
      setAction(state, `Verify failed: ${e?.message || e}`, true);
    }
    setTimeout(() => { setAction(state, null); render(state); }, 3500);
    return;
  }

  if (key.toLowerCase() === 'c') {
    try {
      const meta = await getServerMetadata(slug);
      const st   = statuses[slug] || {};
      const port = (st as any).port || 3456;
      const payload = {
        mcpServers: {
          [slug]: {
            type:    'streamable-http',
            url:     `http://127.0.0.1:${port}/mcp`,
            headers: { Authorization: `Bearer ${meta.authKey}` },
          },
        },
      };
      const copied = await copyToClipboard(JSON.stringify(payload, null, 2));
      const maskedKey = maskKey(meta.authKey);
      setAction(state, copied
        ? `✓ Copied MCP config for ${slug} (key: ${maskedKey})`
        : `MCP config for ${slug} — copy manually from \`hoolix connect ${slug} --json\``);
    } catch (e: any) {
      setAction(state, `Failed to build config: ${e?.message || e}`, true);
    }
    setTimeout(() => { setAction(state, null); render(state); }, 3500);
    return;
  }

  if (key.toLowerCase() === 'x') {
    setAction(state, `Re-indexing ${slug}… (this may take a while)`);
    render(state);
    try {
      const meta = await getServerMetadata(slug);
      if (!meta.sourceUrl) throw new Error('No sourceUrl recorded — cannot reindex');
      const result = await reindexServer({
        slug,
        embeddingModel: (meta as any).embeddingModel || 'fuse',
        maxChunks: 6000,
        maxPages: 80,
      });
      setAction(state, `✓ Reindexed ${slug} — ${result.ingestion.stats.totalChunks} chunks`);
    } catch (e: any) {
      setAction(state, `Reindex failed: ${e?.message || e}`, true);
    }
    await refresh(state);
    setTimeout(() => { setAction(state, null); render(state); }, 3000);
    return;
  }
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function launchTUI(): Promise<void> {
  const testMode = process.env.MCP_PORTAL_TUI_TEST_MODE === '1';

  if (testMode) {
    process.stdout.write('hoolix TUI\n');
  }

  if (!testMode && (process.env.CI || !process.stdout.isTTY || !process.stdin.isTTY)) {
    console.log('hoolix TUI requires an interactive TTY. Use CLI commands instead: hoolix --help');
    return;
  }

  // Final raw-mode probe
  let probeOk = false;
  try {
    if ((process.stdin as any).isTTY) {
      (process.stdin as any).setRawMode(true);
      (process.stdin as any).setRawMode(false);
      probeOk = true;
    }
  } catch { probeOk = false; }

  if (!testMode && !probeOk) {
    console.log('TUI requires a terminal that supports raw mode. Falling back — use CLI commands.');
    return;
  }

  const state: TUIState = {
    servers:       [],
    statuses:      {},
    selectedIndex: 0,
    logTail:       [],
    actionMsg:     null,
    actionIsError: false,
  };

  let poll:        ReturnType<typeof setInterval> | null = null;
  let dataHandler: ((key: string) => void) | null        = null;

  function cleanup() {
    if (poll)        { clearInterval(poll); poll = null; }
    if (dataHandler) { process.stdin.removeListener('data', dataHandler); dataHandler = null; }
    try { (process.stdin as any).setRawMode(false); } catch {}
    process.stdin.pause();
  }

  // Initial load
  await refresh(state);
  render(state);

  const onInput = async (raw: string) => {
    // Quit on Ctrl-C or q
    if (raw === '' || raw.toLowerCase() === 'q') {
      cleanup();
      process.stdout.write(A.clear);
      process.exit(0);
    }
    await handleKey(raw, state);
    render(state);
  };

  if (testMode) {
    const scriptedKeys = (process.env.MCP_PORTAL_TUI_KEYS || 'r,q').split(',').map((k) => k.trim()).filter(Boolean);
    for (const key of scriptedKeys) {
      if (key.toLowerCase() === 'q') break;
      await onInput(key);
    }
    cleanup();
    return;
  }

  dataHandler = (chunk: string) => { onInput(chunk).catch(() => {}); };

  (process.stdin as any).setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', dataHandler);

  // Periodic status + log refresh
  poll = setInterval(async () => {
    await refresh(state);
    if (!state.actionMsg) render(state);
  }, 2000);

  // Handle terminal resize
  process.stdout.on('resize', () => render(state));

  const onSig = () => { cleanup(); process.stdout.write(A.clear); process.exit(0); };
  process.once('SIGINT',  onSig);
  process.once('SIGTERM', onSig);
}
