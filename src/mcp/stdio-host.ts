/**
 * MCP Server Host — stdio transport.
 *
 * Runs a fully functional MCP server over stdin/stdout for MCP clients that
 * prefer the stdio transport (Claude Desktop, VS Code extensions, etc.).
 *
 * This module is called directly by cmdStart when --transport stdio is detected.
 * It runs in the foreground (the process stays alive with stdin open) — which is
 * exactly how stdio MCP servers are supposed to work: the MCP client spawns the
 * process and communicates over stdio.
 *
 * No HTTP, no auth key, no port, no rate limiting — the trust boundary is the
 * OS process ownership (only the client that spawned us talks to us).
 * Audit logging is preserved so usage is still observable via `hoolix audit`.
 *
 * See AGENTS.md "Host Execution Model" for the binary invariants.
 */

import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod';
import fs from 'fs-extra';
import path from 'node:path';
import { createRAGForServer } from '../rag/store.js';
import { logger } from '../core/logger.js';
import { getServerDataDir } from '../core/paths.js';

const DEFAULT_TOOL_TIMEOUT_MS = 15_000;

function getToolTimeoutMs(): number {
  const parsed = parseInt(process.env.MCP_TOOL_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOOL_TIMEOUT_MS;
}

async function withToolTimeout<T>(tool: string, op: Promise<T>): Promise<T> {
  const timeoutMs = getToolTimeoutMs();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${tool} timed out after ${timeoutMs}ms. Next: retry with a narrower query or lower limit.`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([op, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toolErrorResponse(message: string) {
  return { content: [{ type: 'text' as const, text: message }] };
}

export async function startStdioServer(slug: string): Promise<void> {
  logger.info(`Starting stdio MCP server for "${slug}"`);

  const rag = await createRAGForServer(slug);

  const auditPath = path.join(getServerDataDir(slug), 'audit.log');
  const MAX_AUDIT_LINES = 5000;

  async function audit(tool: string, details: Record<string, unknown>) {
    try {
      const line = JSON.stringify({ ts: new Date().toISOString(), tool, transport: 'stdio', ...details }) + '\n';
      await fs.appendFile(auditPath, line).catch(() => {});
      try {
        const content = await fs.readFile(auditPath, 'utf8').catch(() => '');
        const lines = content.split('\n').filter(Boolean);
        if (lines.length > MAX_AUDIT_LINES) {
          await fs.writeFile(auditPath, lines.slice(-Math.floor(MAX_AUDIT_LINES * 0.8)).join('\n') + '\n').catch(() => {});
        }
      } catch {}
    } catch {}
  }

  const server = new McpServer({ name: `hoolix-${slug}`, version: '1.0.0' });

  // ── search_documentation ─────────────────────────────────────────────────
  server.registerTool(
    'search_documentation',
    {
      description:
        'Search the docs (keyword + optional hybrid semantic via BGE). Supports mode (keyword|semantic|hybrid), plus advanced tuning (alpha, reranker=rrf). Always includes Source URLs.',
      inputSchema: z.object({
        query: z.string().min(2).describe('Natural language or keyword query'),
        limit: z.number().int().min(1).max(20).default(8),
        mode:  z.enum(['semantic', 'keyword', 'hybrid']).default('hybrid'),
      }) as any,
    } as any,
    async (args: any) => {
      const { query, limit, mode } = args || {};
      try {
        return await withToolTimeout('search_documentation', (async () => {
          const results = await rag.search(query, { limit, mode });
          await audit('search_documentation', { query: String(query).slice(0, 120), limit, mode, hits: results.length });
          let formatted = results
            .map((r, i) => `[${i + 1}] ${r.metadata.title || r.metadata.url}\n${r.content}\nSource: ${r.metadata.url}\n`)
            .join('\n---\n');
          const MAX_CHARS = 18000;
          if (formatted.length > MAX_CHARS) {
            formatted = formatted.slice(0, MAX_CHARS) + '\n... (truncated; use read_documentation_page for full content)';
          }
          return { content: [{ type: 'text' as const, text: formatted || 'No relevant documentation found.' }] };
        })());
      } catch (e: any) {
        await audit('tool_error', { toolName: 'search_documentation', reason: e?.message || String(e) });
        return toolErrorResponse(e?.message || 'search_documentation failed. Next: retry with a narrower query.');
      }
    },
  );

  // ── read_documentation_page ──────────────────────────────────────────────
  server.registerTool(
    'read_documentation_page',
    {
      description: 'Retrieve the full content of a specific documentation page by its URL or path.',
      inputSchema: z.object({
        urlOrPath: z.string().describe('URL or path fragment to read'),
        maxChunks: z.number().int().min(1).max(30).default(15),
      }) as any,
    } as any,
    async (args: any) => {
      const { urlOrPath, maxChunks } = args || {};
      try {
        return await withToolTimeout('read_documentation_page', (async () => {
          const page = await rag.readPage(urlOrPath, maxChunks);
          if (!page) {
            await audit('read_documentation_page', { urlOrPath: String(urlOrPath).slice(0, 200), found: false });
            return { content: [{ type: 'text' as const, text: `Page not found: ${urlOrPath}` }] };
          }
          await audit('read_documentation_page', { urlOrPath: String(urlOrPath).slice(0, 200), found: true, chunks: page.chunks?.length || 0 });
          return { content: [{ type: 'text' as const, text: `# ${page.title}\n\nSource: ${page.url}\n\n${page.content}` }] };
        })());
      } catch (e: any) {
        await audit('tool_error', { toolName: 'read_documentation_page', reason: e?.message || String(e) });
        return toolErrorResponse(e?.message || 'read_documentation_page failed. Next: retry with a smaller maxChunks value.');
      }
    },
  );

  // ── get_table_of_contents ────────────────────────────────────────────────
  server.registerTool(
    'get_table_of_contents',
    { description: 'Returns a reconstructed table of contents / outline of the entire documentation set.' },
    async () => {
      try {
        return await withToolTimeout('get_table_of_contents', (async () => {
          const toc = await rag.getTableOfContents();
          await audit('get_table_of_contents', { entries: toc.length });
          const text = toc
            .map((item) => `${'  '.repeat(item.level - 1)}- ${item.title}${item.url ? `\n${'  '.repeat(item.level)}Source: ${item.url}` : ''}`)
            .join('\n');
          return { content: [{ type: 'text' as const, text: text || 'No table of contents available.' }] };
        })());
      } catch (e: any) {
        await audit('tool_error', { toolName: 'get_table_of_contents', reason: e?.message || String(e) });
        return toolErrorResponse(e?.message || 'get_table_of_contents failed. Next: retry after reindexing this server.');
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  const shutdown = () => {
    logger.info(`stdio MCP server for "${slug}" shutting down`);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info(`stdio MCP server ready for "${slug}" — waiting for client on stdin`);

  // Keep the process alive by holding open stdin (the transport manages stdin internally,
  // but we need to prevent Node from exiting when there's no other work).
  await new Promise<void>(() => {});
}
