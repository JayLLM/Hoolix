import path from 'node:path';
import fs from 'fs-extra';
import { getServerDataDir } from '../../core/paths.js';
import { getServerMetadata } from '../../core/registry.js';

export interface AuditEntry extends Record<string, unknown> {
  ts?: string;
  tool?: string;
  query?: string;
  urlOrPath?: string;
  hits?: number;
  found?: boolean;
  transport?: string;
}

export interface StatsReport {
  slug: string;
  name: string;
  days: number;
  since: string;
  total: number;
  byTool: Record<string, number>;
  byTransport: Record<string, number>;
  topQueries: Array<{ query: string; count: number; zeroHits: number }>;
  topPages: Array<{ page: string; count: number }>;
  health: {
    avgHitsPerSearch: number;
    zeroHitSearches: number;
    rateLimitEvents: number;
    toolErrors: number;
    readSuccessRate: number;
  };
  dailyActivity: Array<{ date: string; count: number }>;
  firstActivity: string | null;
  lastActivity: string | null;
}

export async function getStatsReport(slug: string, days = 30): Promise<StatsReport | null> {
  const meta = await getServerMetadata(slug);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const auditPath = path.join(getServerDataDir(slug), 'audit.log');
  let raw = '';
  try {
    raw = await fs.readFile(auditPath, 'utf8');
  } catch {
    return null;
  }

  const allEntries: AuditEntry[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { allEntries.push(JSON.parse(t) as AuditEntry); } catch {}
  }
  const entries = allEntries.filter((e) => !e.ts || e.ts >= since);

  const byTool: Record<string, number> = {};
  const byTransport: Record<string, number> = {};
  const queryCounts: Record<string, { count: number; zeroHits: number }> = {};
  const pageCounts: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  let rateLimited = 0;
  let toolErrors = 0;
  let hitsTotal = 0;
  let searchCount = 0;
  let zeroHits = 0;
  let readCount = 0;
  let readFound = 0;

  for (const e of entries) {
    const tool = String(e.tool || 'unknown');
    byTool[tool] = (byTool[tool] || 0) + 1;
    const transport = String(e.transport || 'http');
    byTransport[transport] = (byTransport[transport] || 0) + 1;
    if (e.ts) byDay[e.ts.slice(0, 10)] = (byDay[e.ts.slice(0, 10)] || 0) + 1;

    if (tool === 'search_documentation') {
      searchCount++;
      const hits = typeof e.hits === 'number' ? e.hits : 0;
      hitsTotal += hits;
      if (hits === 0) zeroHits++;
      if (typeof e.query === 'string' && e.query.trim()) {
        const key = e.query.trim().toLowerCase().slice(0, 80);
        queryCounts[key] ||= { count: 0, zeroHits: 0 };
        queryCounts[key].count++;
        if (hits === 0) queryCounts[key].zeroHits++;
      }
    }
    if (tool === 'read_documentation_page') {
      readCount++;
      if (e.found) readFound++;
      if (typeof e.urlOrPath === 'string' && e.urlOrPath.trim()) {
        pageCounts[e.urlOrPath.trim()] = (pageCounts[e.urlOrPath.trim()] || 0) + 1;
      }
    }
    if (tool === 'rate_limited') rateLimited++;
    if (tool === 'tool_error') toolErrors++;
  }

  const dailyActivity = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    dailyActivity.push({ date: d, count: byDay[d] || 0 });
  }

  return {
    slug,
    name: meta.name,
    days,
    since,
    total: entries.length,
    byTool,
    byTransport,
    topQueries: Object.entries(queryCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([query, value]) => ({ query, count: value.count, zeroHits: value.zeroHits })),
    topPages: Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([page, count]) => ({ page, count })),
    health: {
      avgHitsPerSearch: searchCount > 0 ? Math.round((hitsTotal / searchCount) * 10) / 10 : 0,
      zeroHitSearches: zeroHits,
      rateLimitEvents: rateLimited,
      toolErrors,
      readSuccessRate: readCount > 0 ? Math.round((readFound / readCount) * 100) : 100,
    },
    dailyActivity,
    firstActivity: allEntries[0]?.ts || null,
    lastActivity: allEntries[allEntries.length - 1]?.ts || null,
  };
}
