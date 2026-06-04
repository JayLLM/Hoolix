import path from 'node:path';
import fs from 'fs-extra';
import { getServerMetadata } from '../core/registry.js';
import { logger } from '../core/logger.js';
import { getServerDataDir } from '../core/paths.js';
import {
  printTitle, printSection, printDetails, printJson, ui,
  type TableRow,
} from '../ui/format.js';

interface AuditEntry extends Record<string, unknown> {
  ts?:        string;
  tool?:      string;
  query?:     string;
  urlOrPath?: string;
  hits?:      number;
  found?:     boolean;
  entries?:   number;
  reason?:    string;
  transport?: string;
}

function bar(count: number, max: number, width = 20): string {
  const filled = max > 0 ? Math.round((count / max) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '0%';
}

export async function cmdStats(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
  if (!slug) {
    logger.error('Usage: hoolix stats <slug> [--days N] [--json]');
    process.exit(1);
  }

  let meta: any;
  try {
    meta = await getServerMetadata(slug);
  } catch {
    logger.error(`Server "${slug}" not found.`);
    process.exit(1);
  }

  const daysIdx = args.indexOf('--days');
  const days    = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) || 30 : 30;
  const since   = new Date(Date.now() - days * 86400_000).toISOString();

  const auditPath = path.join(getServerDataDir(slug), 'audit.log');
  let raw = '';
  try {
    raw = await fs.readFile(auditPath, 'utf8');
  } catch {
    if (json) {
      printJson({ slug, days, entries: [], message: 'No audit log yet.' });
    } else {
      printTitle('Stats', `${meta.name} (${slug})`);
      console.log(`  No audit log yet — start the server and let agents query it.`);
    }
    return;
  }

  // Parse + filter to the requested window
  const allEntries: AuditEntry[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      allEntries.push(JSON.parse(t) as AuditEntry);
    } catch {}
  }

  const entries = allEntries.filter((e) => !e.ts || e.ts >= since);

  // ── Aggregate ────────────────────────────────────────────────────────────

  const byTool: Record<string, number> = {};
  const queries:    string[]           = [];
  const pagesRead:  string[]           = [];
  let rateLimited   = 0;
  let toolErrors    = 0;
  let hitsTotal     = 0;
  let searchCount   = 0;
  let zeroHits      = 0;
  const byDay: Record<string, number>  = {};

  for (const e of entries) {
    const tool = String(e.tool || 'unknown');
    byTool[tool] = (byTool[tool] || 0) + 1;

    if (e.ts) {
      const day = e.ts.slice(0, 10); // YYYY-MM-DD
      byDay[day] = (byDay[day] || 0) + 1;
    }

    if (tool === 'search_documentation') {
      searchCount++;
      const hits = typeof e.hits === 'number' ? e.hits : 0;
      hitsTotal += hits;
      if (hits === 0) zeroHits++;
      if (typeof e.query === 'string' && e.query.trim()) queries.push(e.query.trim());
    }

    if (tool === 'read_documentation_page') {
      if (typeof e.urlOrPath === 'string' && e.urlOrPath.trim()) pagesRead.push(e.urlOrPath.trim());
    }

    if (tool === 'rate_limited') rateLimited++;
    if (tool === 'tool_error')   toolErrors++;
  }

  const total = entries.length;

  // Top queries by frequency
  const queryCounts: Record<string, number> = {};
  for (const q of queries) {
    const key = q.toLowerCase().slice(0, 80);
    queryCounts[key] = (queryCounts[key] || 0) + 1;
  }
  const topQueries = Object.entries(queryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Top pages by frequency
  const pageCounts: Record<string, number> = {};
  for (const p of pagesRead) {
    pageCounts[p] = (pageCounts[p] || 0) + 1;
  }
  const topPages = Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Daily activity for last 7 days
  const last7Days: Array<{ date: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    last7Days.push({ date: d, count: byDay[d] || 0 });
  }

  const avgHits = searchCount > 0 ? Math.round((hitsTotal / searchCount) * 10) / 10 : 0;
  const firstEntry = allEntries[0]?.ts || null;
  const lastEntry  = allEntries[allEntries.length - 1]?.ts || null;

  // ── JSON output ──────────────────────────────────────────────────────────
  if (json) {
    printJson({
      slug,
      name:      meta.name,
      days,
      since,
      total,
      byTool,
      topQueries: topQueries.map(([q, n]) => ({ query: q, count: n })),
      topPages:   topPages.map(([p, n]) => ({ page: p, count: n })),
      health: {
        avgHitsPerSearch: avgHits,
        zeroHitSearches:  zeroHits,
        rateLimitEvents:  rateLimited,
        toolErrors,
      },
      dailyActivity: last7Days,
      firstActivity: firstEntry,
      lastActivity:  lastEntry,
    });
    return;
  }

  // ── Human output ─────────────────────────────────────────────────────────
  const sinceStr = new Date(since).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const nowStr   = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  printTitle('Stats', `${meta.name} (${slug})`);
  printDetails([
    ['Period',         `Last ${days} days (${sinceStr} → ${nowStr})`],
    ['Total calls',    total.toLocaleString()],
    ['Search queries', searchCount.toLocaleString()],
    ['Page reads',     (byTool['read_documentation_page'] || 0).toLocaleString()],
  ]);
  console.log('');

  // Tool breakdown
  printSection('Tool usage');
  const toolRows: TableRow[] = Object.entries(byTool)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({
      Tool:    tool,
      Calls:   count.toLocaleString(),
      Share:   pct(count, total),
    }));
  if (toolRows.length === 0) {
    console.log(`  ${ui.muted('No tool calls recorded in this period.')}`);
  } else {
    const nameW  = Math.max(8, ...toolRows.map((r) => String(r.Tool).length));
    const countW = Math.max(5, ...toolRows.map((r) => String(r.Calls).length));
    for (const r of toolRows) {
      console.log(
        `  ${String(r.Tool).padEnd(nameW)}  ${String(r.Calls).padStart(countW)}  ${ui.muted(String(r.Share).padStart(4))}`
      );
    }
  }
  console.log('');

  // Top queries
  if (topQueries.length > 0) {
    printSection('Top search queries');
    const maxCount = topQueries[0][1];
    topQueries.forEach(([q, n], i) => {
      const num   = `${i + 1}.`.padEnd(4);
      const count = `×${n}`.padStart(5);
      const b     = bar(n, maxCount, 12);
      const query = q.length > 50 ? q.slice(0, 49) + '…' : q;
      console.log(`  ${ui.muted(num)}${ui.accent(b)} ${count}  ${query}`);
    });
    console.log('');
  }

  // Top pages
  if (topPages.length > 0) {
    printSection('Top retrieved pages');
    const maxCount = topPages[0][1];
    topPages.forEach(([p, n], i) => {
      const num   = `${i + 1}.`.padEnd(4);
      const count = `×${n}`.padStart(5);
      const b     = bar(n, maxCount, 12);
      const page  = p.length > 55 ? '…' + p.slice(-54) : p;
      console.log(`  ${ui.muted(num)}${ui.accent(b)} ${count}  ${ui.muted(page)}`);
    });
    console.log('');
  }

  // Health
  printSection('Health');
  printDetails([
    ['Avg hits / search',   avgHits],
    ['Zero-result searches', `${zeroHits.toLocaleString()} (${pct(zeroHits, searchCount)})`],
    ['Rate limit events',   rateLimited > 0 ? ui.warning(String(rateLimited)) : ui.success('0')],
    ['Tool errors',         toolErrors > 0 ? ui.warning(String(toolErrors)) : ui.success('0')],
  ]);
  console.log('');

  // Activity chart (last 7 days)
  printSection('Activity — last 7 days');
  const maxDay = Math.max(1, ...last7Days.map((d) => d.count));
  for (const { date, count } of last7Days) {
    const dayLabel = new Date(date + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
    const b = bar(count, maxDay, 24);
    console.log(
      `  ${ui.muted(dayLabel.padEnd(10))} ${count > 0 ? ui.accent(b) : ui.muted(b)} ${ui.muted(String(count).padStart(4))}`
    );
  }
  console.log('');

  if (lastEntry) {
    console.log(`  ${ui.muted('Last activity:')} ${new Date(lastEntry).toLocaleString()}`);
    console.log('');
  }

  console.log(`  ${ui.muted('Tip:')} hoolix stats ${slug} --days 7 --json   or   hoolix audit ${slug} for raw entries`);
}
