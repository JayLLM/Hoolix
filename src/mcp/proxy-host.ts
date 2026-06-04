/**
 * MCP Proxy Host — bridges a stdio MCP server process to Hono + Streamable HTTP.
 *
 * Spawns the underlying stdio MCP server (defined in the server's template run config)
 * as a persistent child process, then exposes it over authenticated HTTP with the same
 * auth, rate-limiting, and audit middleware as host.ts.
 *
 * This enables sharing the same underlying server across multiple AI clients,
 * remote access, and unified observability for any mcp-server template.
 *
 * Limitations (Phase 1):
 *   - Supports synchronous JSON-RPC request/response only (no SSE streaming responses).
 *   - Batch JSON-RPC requests are supported.
 *   - Notifications (no id) are forwarded; no response is returned.
 *
 * See AGENTS.md Rule 9 "Two-Kind Template System" and "Proxy Mode".
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { getServerDataDir, getServerRuntimePath, getServerDir } from '../core/paths.js';
import { getServerMetadata } from '../core/registry.js';
import { loadCredentials, interpolateRunConfig } from '../app/services/credentials.js';
import { getTemplate } from '../app/services/catalog.js';

export interface ProxyHostOptions {
  slug: string;
  port: number;
  authKey: string;
  bindHost?: string;
}

const PROXY_REQUEST_TIMEOUT_MS = 30_000;

function maskSecret(value: string, visible = 6): string {
  if (!value) return '';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

/**
 * Manages a persistent stdio child process with JSON-RPC request/response multiplexing.
 * Responses are matched to pending requests by JSON-RPC id.
 */
class StdioJsonRpcProxy {
  private child: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private pending = new Map<string | number, (msg: unknown) => void>();
  private _dead = false;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly env: Record<string, string>,
  ) {}

  async start(): Promise<void> {
    // On Windows, bare 'npx' needs shell resolution
    const cmd = process.platform === 'win32' && this.command === 'npx' ? 'npx.cmd' : this.command;

    this.child = spawn(cmd, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
      shell: false,
    });

    // Pipe child stderr to the proxy-host's stderr (→ host.log via manager redirection)
    this.child.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[child] ${data}`);
    });

    this.rl = readline.createInterface({ input: this.child.stdout! });
    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as any;
        const id = msg?.id;
        if (id !== undefined && id !== null) {
          const resolve = this.pending.get(id);
          if (resolve) {
            this.pending.delete(id);
            resolve(msg);
          }
        }
        // Notifications (no id) are consumed — they don't need a forwarded response.
      } catch {
        // Ignore non-JSON output from child (startup messages, etc.)
      }
    });

    this.child.on('exit', (code, signal) => {
      this._dead = true;
      logger.error(`Proxy child exited: code=${code ?? 'null'}, signal=${signal ?? 'null'}`);
      const err = { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Server process exited unexpectedly' } };
      for (const [, resolve] of this.pending) resolve(err);
      this.pending.clear();
      this.rl?.close();
    });

    // Brief wait for child to boot before declaring ready
    await new Promise<void>((r) => setTimeout(r, 600));
    if (this._dead) throw new Error('Proxy child exited immediately. Check host.log for details.');
  }

  get isAlive(): boolean {
    return !this._dead && this.child != null && !this.child.killed;
  }

  get childPid(): number | undefined {
    return this.child?.pid;
  }

  async send(message: unknown): Promise<unknown> {
    if (!this.isAlive) throw new Error('Proxy child process is not running');
    const msg = message as any;
    const hasId = msg.id !== undefined && msg.id !== null;

    return new Promise((resolve, reject) => {
      const line = JSON.stringify(msg) + '\n';

      if (hasId) {
        const timer = setTimeout(() => {
          this.pending.delete(msg.id);
          reject(new Error(`Proxy request ${msg.id} timed out after ${PROXY_REQUEST_TIMEOUT_MS}ms`));
        }, PROXY_REQUEST_TIMEOUT_MS);

        this.pending.set(msg.id, (response) => {
          clearTimeout(timer);
          resolve(response);
        });
      }

      this.child!.stdin!.write(line, (err) => {
        if (err) {
          if (hasId) this.pending.delete(msg.id);
          reject(new Error(`Failed to write to proxy child: ${err.message}`));
        } else if (!hasId) {
          // Notification — no response expected
          resolve(null);
        }
      });
    });
  }

  kill(): void {
    try {
      this.rl?.close();
      if (this.child && !this.child.killed) this.child.kill('SIGTERM');
    } catch {}
  }
}

export async function startProxyHost(opts: ProxyHostOptions): Promise<void> {
  const { slug, port, authKey, bindHost = '127.0.0.1' } = opts;

  logger.info(`Starting proxy host for "${slug}" on ${bindHost}:${port}`);

  // ── Load run config ─────────────────────────────────────────────────────────
  const meta = await getServerMetadata(slug);
  const templateId = (meta as any).definition?.template?.id as string | undefined;
  if (!templateId) throw new Error(`Server "${slug}" has no template ID — cannot start in proxy mode`);

  const template = await getTemplate(templateId);
  if (!template.server) throw new Error(`Template "${templateId}" has no server run config`);

  const credentials = await loadCredentials(slug);
  const templateInputs = Object.fromEntries(
    Object.entries((meta as any).definition?.template?.inputs ?? {}).map(([k, v]) => [k, String(v)]),
  );
  const substitutions = { ...templateInputs, ...credentials };
  const runConfig = interpolateRunConfig(template.server as any, substitutions);

  // Log run config (redacted) for debugging
  const hostLogPath = path.join(getServerDir(slug), 'host.log');
  await fs.ensureFile(hostLogPath);
  await fs.appendFile(
    hostLogPath,
    `\n--- ${new Date().toISOString()} proxy start ${slug} on :${port} ---\n  cmd: ${runConfig.command} ${runConfig.args.join(' ')}\n`,
  );

  // ── Spawn child stdio server ─────────────────────────────────────────────────
  const proxy = new StdioJsonRpcProxy(runConfig.command, runConfig.args, runConfig.env ?? {});
  await proxy.start();
  logger.info(`Proxy child started (pid=${proxy.childPid ?? 'unknown'}, template=${templateId})`);

  // ── Rate limiter (matches host.ts exactly) ─────────────────────────────────
  const RATE_LIMIT = Math.max(1, parseInt(process.env.MCP_RATE_LIMIT || '120', 10));
  const RATE_WINDOW_MS = Math.max(1000, parseInt(process.env.MCP_RATE_WINDOW_SEC || '60', 10) * 1000);
  const rateStatePath = path.join(getServerDataDir(slug), 'rate-state.json');
  let reqCount = 0;
  let windowStart = Date.now();
  try {
    const state = await fs.readJson(rateStatePath);
    if (typeof state.windowStart === 'number' && typeof state.reqCount === 'number') {
      reqCount = state.reqCount;
      windowStart = state.windowStart;
    }
  } catch {}
  async function saveRateState(): Promise<void> {
    await fs.writeJson(rateStatePath, { windowStart, reqCount, limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS }).catch(() => {});
  }
  async function checkRateLimit(): Promise<boolean> {
    const now = Date.now();
    if (now - windowStart > RATE_WINDOW_MS) { reqCount = 0; windowStart = now; }
    reqCount += 1;
    await saveRateState();
    return reqCount <= RATE_LIMIT;
  }

  // ── Audit (matches host.ts exactly) ─────────────────────────────────────────
  const auditPath = path.join(getServerDataDir(slug), 'audit.log');
  const MAX_AUDIT_LINES = 5000;
  async function audit(tool: string, details: Record<string, unknown>) {
    try {
      const line = JSON.stringify({ ts: new Date().toISOString(), tool, transport: 'proxy', ...details }) + '\n';
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

  // ── Hono HTTP server ─────────────────────────────────────────────────────────
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({ status: proxy.isAlive ? 'ok' : 'degraded', server: slug, mode: 'proxy', template: templateId });
  });

  app.use('/mcp', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const headerKey =
      authHeader?.startsWith('Bearer ') || authHeader?.startsWith('bearer ')
        ? authHeader.replace(/^Bearer\s+/i, '')
        : c.req.header('X-MCP-Key');

    if (!headerKey || headerKey !== authKey) {
      return c.json({ error: 'Unauthorized. Provide valid Authorization: Bearer <key> or X-MCP-Key header.' }, 401);
    }
    if (!(await checkRateLimit())) {
      await audit('rate_limited', { limit: RATE_LIMIT, windowSec: Math.floor(RATE_WINDOW_MS / 1000) });
      c.header('Retry-After', String(Math.ceil(RATE_WINDOW_MS / 1000)));
      return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429);
    }
    await next();
    return;
  });

  app.all('/mcp', async (c) => {
    if (!proxy.isAlive) {
      return c.json(
        { jsonrpc: '2.0', id: null, error: { code: -32000, message: `Proxy child for "${slug}" is not running` } },
        503,
      );
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error — invalid JSON body' } }, 400);
    }
    try {
      if (Array.isArray(body)) {
        const responses = await Promise.all(
          (body as any[]).map(async (req) => {
            await audit('proxy_request', { method: req?.method, id: req?.id });
            return proxy.send(req);
          }),
        );
        return c.json(responses.filter((r) => r !== null));
      }
      const req = body as any;
      await audit('proxy_request', { method: req?.method, id: req?.id });
      const response = await proxy.send(req);
      if (response === null) return new Response(null, { status: 204 });
      return c.json(response);
    } catch (e: any) {
      await audit('proxy_error', { reason: e?.message || String(e) });
      return c.json(
        { jsonrpc: '2.0', id: (body as any)?.id ?? null, error: { code: -32603, message: e?.message || 'Internal proxy error' } },
        500,
      );
    }
  });

  // ── Runtime marker (same format as host.ts + extra proxy fields) ─────────────
  const runtimePath = getServerRuntimePath(slug);
  await fs.writeJson(runtimePath, {
    pid:       process.pid,
    port,
    startedAt: new Date().toISOString(),
    status:    'running',
    mode:      'proxy',
    childPid:  proxy.childPid,
    template:  templateId,
  }, { spaces: 2 });

  // ── Graceful shutdown ─────────────────────────────────────────────────────────
  const shutdown = async () => {
    logger.info(`Shutting down proxy host for "${slug}"...`);
    proxy.kill();
    try { await fs.remove(runtimePath); } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info(`Proxy host ready at http://${bindHost}:${port}/mcp (template: ${templateId})`);
  logger.info(`Auth header required: Authorization: Bearer ${maskSecret(authKey)}`);

  serve({ fetch: app.fetch, port, hostname: bindHost });
}
