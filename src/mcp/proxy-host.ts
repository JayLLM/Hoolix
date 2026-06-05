/**
 * MCP Proxy Host — bridges a stdio MCP server process to Hono + Streamable HTTP.
 *
 * Spawns the underlying stdio MCP server (defined in the server's template run config)
 * as a persistent child process, then exposes it over authenticated HTTP with the same
 * auth, rate-limiting, and audit middleware as host.ts.
 *
 * Features:
 *   - Auto-restart on child exit (exponential backoff, max MAX_RESTARTS attempts)
 *   - Restart counter resets after RESTART_RESET_MS of stable uptime
 *   - 30-second health ping to detect silent child hangs
 *   - SSE response wrapping: when client sends Accept: text/event-stream, the
 *     synchronous JSON-RPC response is streamed as an SSE event (phase 1 compatibility)
 *   - Batch JSON-RPC requests supported
 *   - Notifications (no id) forwarded without response
 *   - No shell:true on Windows — cmd.exe is invoked directly with array args
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
import { timingSafeEqualString } from '../lib/auth.js';
import { RateLimiter } from '../lib/rateLimiter.js';
import { AuditLogger } from '../lib/auditLogger.js';
import { redactSecrets } from '../lib/logRedact.js';

export interface ProxyHostOptions {
  slug: string;
  port: number;
  authKey: string;
  bindHost?: string;
}

const PROXY_REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESTARTS             = 5;
const HEALTH_PING_INTERVAL_MS  = 30_000;
/** Reset the restart counter after this many ms of consecutive stable uptime. */
const RESTART_RESET_MS         = 5 * 60_000; // 5 minutes

function maskSecret(value: string, visible = 6): string {
  if (!value) return '';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

/**
 * Resolve the correct command + args to spawn a child process on the current platform
 * without shell interpolation.
 *
 * On Windows, `.cmd` scripts (like `npx.cmd`) need to be invoked via `cmd.exe /c`
 * rather than via `shell: true`, which would allow cmd.exe to interpret metacharacters
 * in the args string (e.g. `&`, `|`, `%VAR%`).
 */
function resolveSpawnArgs(
  command: string,
  args: string[],
): { cmd: string; argv: string[]; shell: false } {
  if (process.platform === 'win32' && command === 'npx') {
    // Use cmd.exe /c with an explicit array — no shell interpolation of args.
    return { cmd: 'cmd.exe', argv: ['/c', 'npx.cmd', ...args], shell: false };
  }
  return { cmd: command, argv: args, shell: false };
}

/**
 * Manages a persistent stdio child process with JSON-RPC request/response multiplexing.
 * Auto-restarts on unexpected child exit (exponential backoff, max MAX_RESTARTS).
 * Restart counter resets after RESTART_RESET_MS of stable uptime.
 */
class StdioJsonRpcProxy {
  private child: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private pending = new Map<string | number, (msg: unknown) => void>();
  private _dead = false;
  private restartCount = 0;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly env: Record<string, string>,
  ) {}

  async start(): Promise<void> {
    await this._spawnChild();

    // 30-second health monitoring: send ping → expect pong or any response
    this.healthTimer = setInterval(() => {
      if (!this.isAlive) return;
      this.send({ jsonrpc: '2.0', id: `__health-${Date.now()}`, method: 'ping', params: {} })
        .catch(() => {
          // ping failure is expected for servers that don't implement ping
        });
    }, HEALTH_PING_INTERVAL_MS);

    if (this.healthTimer.unref) this.healthTimer.unref();
  }

  private async _spawnChild(): Promise<void> {
    const { cmd, argv, shell } = resolveSpawnArgs(this.command, this.args);

    this.child = spawn(cmd, argv, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
      shell,
    });

    // Redact secrets from child stderr before writing to host.log
    this.child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf8');
      process.stderr.write(`[child] ${redactSecrets(text)}`);
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

    this.child.on('exit', (exitCode, exitSignal) => {
      logger.error(`Proxy child exited: code=${exitCode ?? 'null'}, signal=${exitSignal ?? 'null'}`);
      if (this.stableTimer) { clearTimeout(this.stableTimer); this.stableTimer = null; }
      this.rl?.close();
      this._tryRestart(exitCode, exitSignal);
    });

    // Brief wait for child to boot
    await new Promise<void>((r) => setTimeout(r, 600));

    if (this._dead) {
      throw new Error('Proxy child exited immediately. Check host.log for details.');
    }

    // Schedule restart-counter reset after stable uptime
    this.stableTimer = setTimeout(() => {
      if (!this._dead) {
        this.restartCount = 0;
        logger.debug(`Proxy child for "${this.command}" has been stable; restart counter reset.`);
      }
    }, RESTART_RESET_MS);
    this.stableTimer.unref?.();
  }

  private _tryRestart(_code: number | null, _signal: string | null): void {
    if (this.restartCount >= MAX_RESTARTS) {
      logger.error(`Proxy child has exited ${MAX_RESTARTS} times — giving up. Proxy will remain in degraded state.`);
      this._dead = true;
      const err = { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Server process exited after too many restarts' } };
      for (const [, resolve] of this.pending) resolve(err);
      this.pending.clear();
      return;
    }

    // Fail existing pending requests while we restart
    const restartErr = { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Server process restarting' } };
    for (const [, resolve] of this.pending) resolve(restartErr);
    this.pending.clear();

    const delay = Math.min(16000, 1000 * 2 ** this.restartCount);
    this.restartCount++;
    logger.warn(`Proxy child restarting (attempt ${this.restartCount}/${MAX_RESTARTS}) in ${delay}ms…`);

    setTimeout(async () => {
      if (this._dead) return;
      try {
        await this._spawnChild();
        logger.info(`Proxy child restarted successfully (attempt ${this.restartCount})`);
      } catch (e: any) {
        logger.error(`Proxy child restart failed: ${e?.message || e}`);
        this._tryRestart(null, null);
      }
    }, delay);
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
      if (this.healthTimer) clearInterval(this.healthTimer);
      if (this.stableTimer) clearTimeout(this.stableTimer);
      this._dead = true;
      this.rl?.close();
      if (this.child && !this.child.killed) this.child.kill('SIGTERM');
    } catch {}
  }
}

// ── SSE helper ────────────────────────────────────────────────────────────────

function jsonRpcToSSE(response: unknown): Response {
  const encoder = new TextEncoder();
  const json = JSON.stringify(response);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${json}\n\n`));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function startProxyHost(opts: ProxyHostOptions): Promise<void> {
  const { slug, port, authKey, bindHost = '127.0.0.1' } = opts;

  // Catch-all so a child crash path can't bring down the proxy process.
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection in proxy "${slug}": ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
  });
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception in proxy "${slug}": ${err.stack || err.message}`);
  });

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

  // ── In-memory rate limiter with periodic persistence ───────────────────────
  const RATE_LIMIT     = Math.max(1, parseInt(process.env.MCP_RATE_LIMIT || '120', 10));
  const RATE_WINDOW_MS = Math.max(1000, parseInt(process.env.MCP_RATE_WINDOW_SEC || '60', 10) * 1000);
  const rateStatePath  = path.join(getServerDataDir(slug), 'rate-state.json');
  const rateLimiter = new RateLimiter(RATE_LIMIT, RATE_WINDOW_MS, rateStatePath);
  await rateLimiter.init();

  // ── Audit logger with in-memory counting and atomic rotation ────────────────
  const auditPath = path.join(getServerDataDir(slug), 'audit.log');
  const auditLogger = new AuditLogger(auditPath);
  await auditLogger.init();

  // ── Hono HTTP server ─────────────────────────────────────────────────────────
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({
      status:     proxy.isAlive ? 'ok' : 'degraded',
      server:     slug,
      mode:       'proxy',
      template:   templateId,
      restarts:   (proxy as any).restartCount ?? 0,
    });
  });

  // Auth + rate-limit middleware. Timing-safe bearer compare.
  app.use('/mcp', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const headerKey  =
      (authHeader?.startsWith('Bearer ') || authHeader?.startsWith('bearer '))
        ? authHeader.replace(/^Bearer\s+/i, '')
        : c.req.header('X-MCP-Key');

    if (!headerKey || !timingSafeEqualString(headerKey, authKey)) {
      return c.json({ error: 'Unauthorized. Provide valid Authorization: Bearer <key> or X-MCP-Key header.' }, 401);
    }
    if (!rateLimiter.check()) {
      await auditLogger.write('rate_limited', { limit: RATE_LIMIT, windowSec: Math.floor(RATE_WINDOW_MS / 1000) });
      c.header('Retry-After', String(rateLimiter.retryAfterSeconds()));
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

    const acceptHeader = c.req.header('Accept') ?? '';
    const preferSSE    = acceptHeader.includes('text/event-stream');

    try {
      if (Array.isArray(body)) {
        const responses = await Promise.all(
          (body as any[]).map(async (req) => {
            await auditLogger.write('proxy_request', { method: req?.method, id: req?.id });
            return proxy.send(req);
          }),
        );
        const filtered = responses.filter((r) => r !== null);
        if (preferSSE) return jsonRpcToSSE(filtered);
        return c.json(filtered);
      }

      const req = body as any;
      await auditLogger.write('proxy_request', { method: req?.method, id: req?.id });
      const response = await proxy.send(req);
      if (response === null) return new Response(null, { status: 204 });
      if (preferSSE) return jsonRpcToSSE(response);
      return c.json(response);
    } catch (e: any) {
      await auditLogger.write('proxy_error', { reason: e?.message || String(e) });
      const errResponse = {
        jsonrpc: '2.0',
        id:      (body as any)?.id ?? null,
        error:   { code: -32603, message: e?.message || 'Internal proxy error' },
      };
      if (preferSSE) return jsonRpcToSSE(errResponse);
      return c.json(errResponse, 500);
    }
  });

  const runtimePath = getServerRuntimePath(slug);

  // Graceful shutdown: flush rate state before exit.
  const shutdown = async () => {
    logger.info(`Shutting down proxy host for "${slug}"…`);
    proxy.kill();
    rateLimiter.stop();
    await rateLimiter.flush().catch(() => {});
    try { await fs.remove(runtimePath); } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);

  logger.info(`Proxy host ready at http://${bindHost}:${port}/mcp (template: ${templateId})`);
  logger.info(`Auth header required: Authorization: Bearer ${maskSecret(authKey)}`);
  logger.info(`Auto-restart enabled: max ${MAX_RESTARTS} attempts with exponential backoff`);

  // Bind first, then write .runtime.json so callers can trust the port is actually live.
  const nodeServer = serve({ fetch: app.fetch, port, hostname: bindHost });

  await new Promise<void>((resolve, reject) => {
    (nodeServer as any).once('listening', () => resolve());
    (nodeServer as any).once('error', (err: Error) => reject(err));
    if ((nodeServer as any).listening) resolve();
  });

  await fs.writeJson(runtimePath, {
    pid:       process.pid,
    port,
    startedAt: new Date().toISOString(),
    status:    'running',
    mode:      'proxy',
    childPid:  proxy.childPid,
    template:  templateId,
  }, { spaces: 2 });
}
