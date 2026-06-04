import path from 'node:path';
import fs from 'fs-extra';
import { logger } from '../core/logger.js';
import { getServerDataDir } from '../core/paths.js';
import {
  printTitle, printSection, printCommand, printDetails, printTable, printJson,
  type TableRow,
} from '../ui/format.js';

interface AuditEntry extends Record<string, unknown> {
  ts?: string;
  tool?: string;
  hits?: number;
  found?: boolean;
  entries?: number;
  query?: string;
  urlOrPath?: string;
}

function summarizeAudit(entries: AuditEntry[]) {
  const chronological = [...entries].sort((a, b) =>
    String(a.ts || '').localeCompare(String(b.ts || ''))
  );
  const byTool: Record<string, number> = {};
  let hitsTotal = 0;
  let searchCount = 0;
  let rateLimited = 0;

  for (const entry of entries) {
    const tool = String(entry.tool || 'unknown');
    byTool[tool] = (byTool[tool] || 0) + 1;
    if (tool === 'rate_limited') rateLimited++;
    if (tool === 'search_documentation' && typeof entry.hits === 'number') {
      hitsTotal += entry.hits;
      searchCount++;
    }
  }

  const topTool = Object.entries(byTool).sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    firstTs: chronological[0]?.ts || null,
    lastTs:  chronological[chronological.length - 1]?.ts || null,
    byTool,
    topTool,
    rateLimited,
    avgHitsPerSearch: searchCount > 0 ? Math.round((hitsTotal / searchCount) * 10) / 10 : 0,
  };
}

export async function cmdAudit(args: string[]): Promise<void> {
  const slug = args[1];
  if (!slug) {
    logger.error('Usage: hoolix audit <slug> [--json] [--limit N] [--tool <name>] [--since <iso-prefix>]');
    process.exit(1);
  }

  const json       = args.includes('--json');
  const limitIdx   = args.indexOf('--limit');
  const limit      = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) || 50 : 50;
  const toolIdx    = args.indexOf('--tool');
  const toolFilter = toolIdx !== -1 && args[toolIdx + 1] ? args[toolIdx + 1] : undefined;
  const sinceIdx   = args.indexOf('--since');
  const sinceFilter = sinceIdx !== -1 && args[sinceIdx + 1] ? args[sinceIdx + 1] : undefined;

  const auditPath = path.join(getServerDataDir(slug), 'audit.log');
  let raw = '';
  try {
    raw = await fs.readFile(auditPath, 'utf8');
  } catch {
    if (json) {
      printJson({ slug, entries: [], message: 'No audit log yet (server must be started and tools invoked).' });
    } else {
      printTitle('Audit Log', slug);
      console.log(`  No audit.log found for this server.`);
      console.log(`  Start the server and perform searches/reads to generate entries.`);
      printCommand(`hoolix start ${slug}`);
    }
    return;
  }

  const entries: AuditEntry[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t) as AuditEntry;
      if (toolFilter && e.tool !== toolFilter) continue;
      if (sinceFilter && typeof e.ts === 'string' && !e.ts.startsWith(sinceFilter)) continue;
      entries.push(e);
    } catch {
      // skip malformed lines
    }
  }

  entries.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  const shown   = entries.slice(0, limit);
  const summary = summarizeAudit(entries);

  if (json) {
    printJson({ slug, count: entries.length, showing: shown.length, summary, entries: shown });
    return;
  }

  printTitle('Audit Log', slug);
  printDetails([
    ['Total entries',    entries.length],
    ['Showing (newest)', shown.length],
    ['Time range',       summary.firstTs && summary.lastTs ? `${summary.firstTs} → ${summary.lastTs}` : 'n/a'],
    ['Top tool',         summary.topTool || 'n/a'],
    ['Rate limited',     summary.rateLimited],
    ['Avg hits/search',  summary.avgHitsPerSearch],
    ['Log path',         auditPath],
  ]);

  if (Object.keys(summary.byTool).length > 0) {
    console.log('');
    printSection('Summary by tool');
    printTable(Object.entries(summary.byTool).map(([tool, count]) => ({ tool, count })));
  }
  console.log('');

  if (shown.length === 0) {
    console.log(`  No matching entries.`);
    return;
  }

  const rows: TableRow[] = shown.map((e) => {
    const q     = (e.query as string | undefined)?.slice(0, 48) || (e.urlOrPath as string | undefined)?.slice(0, 48) || '';
    const extra = e.hits != null ? `hits=${e.hits}` : e.found != null ? `found=${e.found}` : e.entries != null ? `entries=${e.entries}` : '';
    return {
      ts:      String(e.ts || '').replace('T', ' ').replace(/\.\d+Z$/, 'Z'),
      tool:    String(e.tool || ''),
      details: [q, extra].filter(Boolean).join(' '),
    };
  });

  printTable(rows);
  console.log('');
  if (entries.length > limit) {
    console.log(`  ... ${entries.length - limit} more (use --limit or --json for full)`);
  }
  console.log(`  Filters: --tool search_documentation --since 2026- --limit 100`);
}
