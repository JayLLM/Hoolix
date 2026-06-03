/**
 * MCP Server Host (Streamable HTTP transport).
 *
 * Standalone runnable (for dev/manual) or invoked internally by packaged binary via __internal-host.
 * See AGENTS.md "Host Execution Model".
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { createRAGForServer } from '../rag/store.js';
import { logger } from '../core/logger.js';
import fs from 'fs-extra';
import { getServerRuntimePath, getServerDataDir } from '../core/paths.js';
import path from 'node:path';

export interface HostOptions {
  slug: string;
  port: number;
  dataDir: string;
  authKey: string;
  bindHost?: string;
}

async function parseArgs(): Promise<HostOptions> {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const slug = get('slug');
  const portStr = get('port');
  const dataDir = get('data-dir');
  const authKey = get('auth-key');

  if (!slug || !portStr || !dataDir || !authKey) {
    console.error('Usage: host.ts --slug <name> --port <number> --data-dir <path> --auth-key <key>');
    process.exit(1);
  }

  return {
    slug,
    port: parseInt(portStr, 10),
    dataDir,
    authKey,
    bindHost: '127.0.0.1',
  };
}

async function startHostedServer(opts: HostOptions) {
  const { slug, port, dataDir: _dataDir, authKey, bindHost = '127.0.0.1' } = opts;

  logger.info(`Starting MCP host for "${slug}" on ${bindHost}:${port}`);

  // Load RAG (Fuse default; hybrid if server was indexed that way)
  const rag = await createRAGForServer(slug);

  // In-memory rate limiter (per-server; token-bucket style with fixed window for simplicity).
  // 120 req / 60s default. Configurable via env for advanced use (MCP_RATE_LIMIT, MCP_RATE_WINDOW_SEC).
  // Returns true if allowed; callers handle 429 + Retry-After.
  const RATE_LIMIT = Math.max(1, parseInt(process.env.MCP_RATE_LIMIT || '120', 10));
  const RATE_WINDOW_MS = Math.max(1000, (parseInt(process.env.MCP_RATE_WINDOW_SEC || '60', 10)) * 1000);
  let reqCount = 0;
  let windowStart = Date.now();
  function checkRateLimit(): boolean {
    const now = Date.now();
    if (now - windowStart > RATE_WINDOW_MS) {
      reqCount = 0;
      windowStart = now;
    }
    reqCount += 1;
    return reqCount <= RATE_LIMIT;
  }

  const auditPath = path.join(getServerDataDir(slug), 'audit.log');
  const MAX_AUDIT_LINES = 5000; // keep last N lines to prevent unbounded growth (advanced audit rotation)
  async function audit(tool: string, details: Record<string, unknown>) {
    try {
      const line = JSON.stringify({ ts: new Date().toISOString(), tool, ...details }) + '\n';
      await fs.appendFile(auditPath, line).catch(() => {});

      // Simple rotation/trim for production hygiene (no external deps, cross-platform)
      try {
        const content = await fs.readFile(auditPath, 'utf8').catch(() => '');
        const lines = content.split('\n').filter(Boolean);
        if (lines.length > MAX_AUDIT_LINES) {
          const kept = lines.slice(-Math.floor(MAX_AUDIT_LINES * 0.8)).join('\n') + '\n';
          await fs.writeFile(auditPath, kept).catch(() => {});
          logger.debug(`Rotated audit.log for ${slug} (kept last ~${Math.floor(MAX_AUDIT_LINES * 0.8)} entries)`);
        }
      } catch {}
    } catch {}
  }

  const server = new McpServer({
    name: `hoolix-${slug}`,
    version: '1.0.0',
  });

  // search_documentation tool
  server.registerTool(
    'search_documentation',
    {
      description: 'Search the docs (keyword + optional hybrid semantic via BGE). Supports mode (keyword|semantic|hybrid), plus advanced tuning (alpha, reranker=rrf) for production relevance. Always includes Source URLs.',
      inputSchema: z.object({
        query: z.string().min(2).describe('Natural language or keyword query'),
        limit: z.number().int().min(1).max(20).default(8),
        mode: z.enum(['semantic', 'keyword', 'hybrid']).default('hybrid'),
      }) as any,
    } as any,
    async (args: any) => {
      const { query, limit, mode } = args || {};
      const results = await rag.search(query, { limit, mode });
      await audit('search_documentation', { query: String(query).slice(0, 120), limit, mode, hits: results.length });
      let formatted = results.map((r, i) => 
        `[${i + 1}] ${r.metadata.title || r.metadata.url}\n${r.content}\nSource: ${r.metadata.url}\n`
      ).join('\n---\n');
      const MAX_CHARS = 18000;
      if (formatted.length > MAX_CHARS) {
        formatted = formatted.slice(0, MAX_CHARS) + '\n... (truncated for response size; use read_documentation_page or smaller limit for full content)';
      }

      return {
        content: [{ type: 'text', text: formatted || 'No relevant documentation found.' }],
      };
    }
  );

  // read_documentation_page tool
  server.registerTool(
    'read_documentation_page',
    {
      description: 'Retrieve the full or substantial content of a specific documentation page by its URL or path.',
      inputSchema: z.object({
        urlOrPath: z.string().describe('URL or path fragment to read'),
        maxChunks: z.number().int().min(1).max(30).default(15),
      }) as any,
    } as any,
    async (args: any) => {
      const { urlOrPath, maxChunks } = args || {};
      const page = await rag.readPage(urlOrPath, maxChunks);
      if (!page) {
        await audit('read_documentation_page', { urlOrPath: String(urlOrPath).slice(0, 200), found: false });
        return { content: [{ type: 'text', text: `Page not found: ${urlOrPath}` }] };
      }
      await audit('read_documentation_page', { urlOrPath: String(urlOrPath).slice(0, 200), found: true, chunks: page.chunks?.length || 0 });
      return {
        content: [{ type: 'text', text: `# ${page.title}\n\n${page.content}` }],
      };
    }
  );

  // get_table_of_contents tool
  server.registerTool(
    'get_table_of_contents',
    {
      description: 'Returns a reconstructed table of contents / outline of the entire documentation set.',
    },
    async () => {
      const toc = await rag.getTableOfContents();
      await audit('get_table_of_contents', { entries: toc.length });
      const text = toc.map(item => `${'  '.repeat(item.level - 1)}- ${item.title}`).join('\n');
      return { content: [{ type: 'text', text: text || 'No table of contents available.' }] };
    }
  );

  // Hono + Streamable HTTP transport setup
  const app = new Hono();

  // Health (unauthenticated) must be registered before the /mcp auth middleware
  app.get('/health', async (c) => {
    let hasData = false;
    try {
      hasData = (await rag.search('test', { limit: 1 })).length > 0;
    } catch {}
    return c.json({ status: 'ok', server: slug, chunks: hasData ? 'indexed' : 'empty' });
  });

  // Auth middleware (Bearer or X-MCP-Key). Registered only on /mcp; /health stays public.
  app.use('/mcp', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const headerKey =
      (authHeader?.startsWith('Bearer ') || authHeader?.startsWith('bearer '))
        ? authHeader.replace(/^Bearer\s+/i, '')
        : c.req.header('X-MCP-Key');

    if (!headerKey || headerKey !== authKey) {
      return c.json(
        { error: 'Unauthorized. Provide valid Authorization: Bearer <key> or X-MCP-Key header.' },
        401,
      );
    }
    if (!checkRateLimit()) {
      await audit('rate_limited', { path: c.req.path, limit: RATE_LIMIT, windowSec: Math.floor(RATE_WINDOW_MS / 1000) });
      // Retry-After for clients (and MCP hosts) — advanced rate limiting surface
      c.header('Retry-After', String(Math.ceil(RATE_WINDOW_MS / 1000)));
      return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429);
    }
    await next();
    return;
  });

  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);

  app.all('/mcp', (c) => transport.handleRequest(c.req.raw));

  // Write .runtime.json for parent process liveness + port discovery
  const runtimePath = getServerRuntimePath(slug);
  await fs.writeJson(runtimePath, {
    pid: process.pid,
    port,
    startedAt: new Date().toISOString(),
    status: 'running',
  }, { spaces: 2 });

  // Graceful shutdown (remove runtime marker)
  const shutdown = async () => {
    logger.info('Shutting down MCP host...');
    try { await fs.remove(runtimePath); } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info(`MCP server ready at http://${bindHost}:${port}/mcp`);
  logger.info(`Auth header required: Authorization: Bearer ${authKey}`);

  serve({
    fetch: app.fetch,
    port,
    hostname: bindHost,
  });
}

/**
 * Direct execution guard for host mode.
 *
 * Only activates the host parser+server when the four --slug/--port/--data-dir/--auth-key
 * args are present. This reliably distinguishes:
 * - `tsx src/mcp/host.ts --slug ...` (manual/dev)
 * - `node --import tsx ...`
 * - compiled-binary __internal-host self-spawn
 *
 * Prevents the main CLI bundle from ever entering host logic accidentally.
 */
if (
  !process.argv.includes('__internal-host') &&
  process.argv.includes('--slug') &&
  process.argv.includes('--port') &&
  process.argv.includes('--data-dir') &&
  process.argv.includes('--auth-key')
) {
  parseArgs()
    .then(startHostedServer)
    .catch((err) => {
      console.error('Fatal error starting MCP host:', err);
      process.exit(1);
    });
}

export { startHostedServer };
