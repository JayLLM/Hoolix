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
import { getServerMetadata } from '../core/registry.js';
import { timingSafeEqualString } from '../lib/auth.js';
import { RateLimiter } from '../lib/rateLimiter.js';
import { AuditLogger } from '../lib/auditLogger.js';

export interface HostOptions {
  slug: string;
  port: number;
  dataDir: string;
  authKey: string;
  bindHost?: string;
}

const DEFAULT_TOOL_TIMEOUT_MS = 15_000;

function maskSecret(value: string, visible = 6): string {
  if (!value) return '';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

function getToolTimeoutMs(): number {
  const parsed = parseInt(process.env.MCP_TOOL_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOOL_TIMEOUT_MS;
}

async function withToolTimeout<T>(tool: string, op: Promise<T>): Promise<T> {
  const timeoutMs = getToolTimeoutMs();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${tool} timed out after ${timeoutMs}ms. Next: retry with a narrower query or lower limit.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([op, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toolErrorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
  };
}

function formatResultSource(metadata: { url: string; sourceLabel?: string; sourceType?: string }): string {
  const prefix = metadata.sourceLabel ? `Source (${metadata.sourceLabel})` : 'Source';
  const type = metadata.sourceType ? ` [${metadata.sourceType}]` : '';
  return `${prefix}${type}: ${metadata.url}`;
}

function tokenBudget(args: any, fallbackTokens: number): number {
  const maxTokens = Number(args?.maxTokens || 0);
  const contextWindowTokens = Number(args?.contextWindowTokens || 0);
  const fromContext = contextWindowTokens > 0 ? Math.floor(contextWindowTokens * 0.25) : fallbackTokens;
  const budget = maxTokens > 0 ? Math.min(maxTokens, fromContext) : fromContext;
  return Math.max(500, Math.min(12000, budget));
}

function truncateToTokenBudget(text: string, budgetTokens: number): string {
  const maxChars = budgetTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n... (truncated to ~${budgetTokens} tokens; pass maxTokens or use read_documentation_page for more)`;
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

  // Catch-all for unhandled rejections so a bad RAG query can't crash the host process.
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection in host "${slug}": ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
  });
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception in host "${slug}": ${err.stack || err.message}`);
  });

  logger.info(`Starting MCP host for "${slug}" on ${bindHost}:${port}`);

  // Load RAG (Fuse default; hybrid if server was indexed that way)
  const rag = await createRAGForServer(slug);
  const meta = await getServerMetadata(slug).catch(() => null);

  // In-memory rate limiter with periodic persistence (no per-request file I/O).
  const RATE_LIMIT = Math.max(1, parseInt(process.env.MCP_RATE_LIMIT || '120', 10));
  const RATE_WINDOW_MS = Math.max(1000, (parseInt(process.env.MCP_RATE_WINDOW_SEC || '60', 10)) * 1000);
  const rateStatePath = path.join(getServerDataDir(slug), 'rate-state.json');
  const rateLimiter = new RateLimiter(RATE_LIMIT, RATE_WINDOW_MS, rateStatePath);
  await rateLimiter.init();

  // Audit logger with in-memory line counter and atomic rotation.
  const auditPath = path.join(getServerDataDir(slug), 'audit.log');
  const auditLogger = new AuditLogger(auditPath);
  await auditLogger.init();

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
        maxTokens: z.number().int().min(500).max(12000).optional().describe('Approximate output token budget for this response'),
        contextWindowTokens: z.number().int().min(1000).max(1000000).optional().describe('Client context window size; hoolix uses about 25% for search output'),
      }) as any,
    } as any,
    async (args: any) => {
      const { query, limit, mode } = args || {};
      try {
        return await withToolTimeout('search_documentation', (async () => {
          const results = await rag.search(query, { limit, mode });
          await auditLogger.write('search_documentation', { query: String(query).slice(0, 120), limit, mode, hits: results.length });
          let formatted = results.map((r, i) =>
            `[${i + 1}] ${r.metadata.title || r.metadata.url}\n${r.content}\n${formatResultSource(r.metadata)}\n`
          ).join('\n---\n');
          formatted = truncateToTokenBudget(formatted, tokenBudget(args, 4500));

          return {
            content: [{ type: 'text' as const, text: formatted || 'No relevant documentation found.' }],
          };
        })());
      } catch (e: any) {
        await auditLogger.write('tool_error', { toolName: 'search_documentation', reason: e?.message || String(e) });
        return toolErrorResponse(e?.message || 'search_documentation failed. Next: retry with a narrower query.');
      }
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
        maxTokens: z.number().int().min(500).max(20000).optional().describe('Approximate output token budget for this response'),
        contextWindowTokens: z.number().int().min(1000).max(1000000).optional().describe('Client context window size; hoolix uses about 35% for page reads'),
      }) as any,
    } as any,
    async (args: any) => {
      const { urlOrPath, maxChunks } = args || {};
      try {
        return await withToolTimeout('read_documentation_page', (async () => {
          const page = await rag.readPage(urlOrPath, maxChunks);
          if (!page) {
            await auditLogger.write('read_documentation_page', { urlOrPath: String(urlOrPath).slice(0, 200), found: false });
            return { content: [{ type: 'text' as const, text: `Page not found: ${urlOrPath}` }] };
          }
          await auditLogger.write('read_documentation_page', { urlOrPath: String(urlOrPath).slice(0, 200), found: true, chunks: page.chunks?.length || 0 });
          const text = `# ${page.title}\n\nSource: ${page.url}${meta?.definition?.template ? `\nTemplate: ${meta.definition.template.name}` : ''}\n\n${page.content}`;
          return { content: [{ type: 'text' as const, text: truncateToTokenBudget(text, tokenBudget(args, 7000)) }] };
        })());
      } catch (e: any) {
        await auditLogger.write('tool_error', { toolName: 'read_documentation_page', reason: e?.message || String(e) });
        return toolErrorResponse(e?.message || 'read_documentation_page failed. Next: retry with a smaller maxChunks value.');
      }
    }
  );

  // get_table_of_contents tool
  server.registerTool(
    'get_table_of_contents',
    {
      description: 'Returns a reconstructed table of contents / outline of the entire documentation set.',
    },
    async () => {
      try {
        return await withToolTimeout('get_table_of_contents', (async () => {
          const toc = await rag.getTableOfContents();
          await auditLogger.write('get_table_of_contents', { entries: toc.length });
          const text = toc
            .map(item => `${'  '.repeat(item.level - 1)}- ${item.title}${item.url ? `\n${'  '.repeat(item.level)}Source: ${item.url}` : ''}`)
            .join('\n');
          return { content: [{ type: 'text' as const, text: text || 'No table of contents available.' }] };
        })());
      } catch (e: any) {
        await auditLogger.write('tool_error', { toolName: 'get_table_of_contents', reason: e?.message || String(e) });
        return toolErrorResponse(e?.message || 'get_table_of_contents failed. Next: retry after reindexing this server.');
      }
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

  // Auth middleware (Bearer or X-MCP-Key). Timing-safe compare. Registered only on /mcp.
  app.use('/mcp', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const headerKey =
      (authHeader?.startsWith('Bearer ') || authHeader?.startsWith('bearer '))
        ? authHeader.replace(/^Bearer\s+/i, '')
        : c.req.header('X-MCP-Key');

    if (!headerKey || !timingSafeEqualString(headerKey, authKey)) {
      return c.json(
        { error: 'Unauthorized. Provide valid Authorization: Bearer <key> or X-MCP-Key header.' },
        401,
      );
    }
    if (!rateLimiter.check()) {
      await auditLogger.write('rate_limited', { path: c.req.path, limit: RATE_LIMIT, windowSec: Math.floor(RATE_WINDOW_MS / 1000) });
      c.header('Retry-After', String(rateLimiter.retryAfterSeconds()));
      return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429);
    }
    await next();
    return;
  });

  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);

  app.all('/mcp', (c) => transport.handleRequest(c.req.raw));

  const runtimePath = getServerRuntimePath(slug);

  // Graceful shutdown: flush state before exit.
  const shutdown = async () => {
    logger.info('Shutting down MCP host...');
    rateLimiter.stop();
    await rateLimiter.flush().catch(() => {});
    try { await fs.remove(runtimePath); } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info(`MCP server ready at http://${bindHost}:${port}/mcp`);
  logger.info(`Auth header required: Authorization: Bearer ${maskSecret(authKey)}`);

  // Bind first, then write .runtime.json so callers can trust the port is actually live.
  const nodeServer = serve({
    fetch: app.fetch,
    port,
    hostname: bindHost,
  });

  await new Promise<void>((resolve, reject) => {
    (nodeServer as any).once('listening', () => resolve());
    (nodeServer as any).once('error', (err: Error) => reject(err));
    // If server is already listening (unlikely but possible in test environments)
    if ((nodeServer as any).listening) resolve();
  });

  await fs.writeJson(runtimePath, {
    pid: process.pid,
    port,
    startedAt: new Date().toISOString(),
    status: 'running',
  }, { spaces: 2 });
}

/**
 * Direct execution guard for host mode.
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
