import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { getGateway, type GatewayConfig } from '../core/gateways.js';
import { getGatewayDataDir, getGatewayRuntimePath, getServerDir } from '../core/paths.js';
import { getServerMetadata } from '../core/registry.js';
import { getTemplate } from '../app/services/catalog.js';
import { loadCredentials, interpolateRunConfig } from '../app/services/credentials.js';
import { findProfileByAuthKey, type Profile } from '../core/profiles.js';
import { evaluatePolicy } from '../core/policy.js';
import { consumeMatchingApproval, findDeniedMatchingApproval, hashArgs, previewArgs, queueApproval } from '../core/approvals.js';

export interface GatewayHostOptions {
  slug: string;
  port: number;
  authKey: string;
  bindHost?: string;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface RequestIdentity {
  profile: Profile | null;
  authType: 'gateway' | 'profile';
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const REQUEST_TIMEOUT_MS = 30_000;
const HEALTH_PING_INTERVAL_MS = 30_000;

class GatewayChild {
  private child: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private pending = new Map<string | number, (msg: unknown) => void>();
  private nextId = 1;
  private initialized = false;

  constructor(
    readonly slug: string,
    readonly namespace: string,
    private readonly command: string,
    private readonly args: string[],
    private readonly env: Record<string, string>,
  ) {}

  async start(): Promise<void> {
    const isWindowsNpx = process.platform === 'win32' && this.command === 'npx';
    const cmd = isWindowsNpx ? 'npx.cmd' : this.command;
    this.child = spawn(cmd, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
      shell: isWindowsNpx,
    });

    this.child.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[${this.slug}] ${data}`);
    });

    this.rl = readline.createInterface({ input: this.child.stdout! });
    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as { id?: string | number };
        if (msg.id !== undefined && msg.id !== null) {
          const resolve = this.pending.get(msg.id);
          if (resolve) {
            this.pending.delete(msg.id);
            resolve(msg);
          }
        }
      } catch {}
    });

    this.child.on('exit', (code, signal) => {
      logger.error(`Gateway child "${this.slug}" exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
      const err = { jsonrpc: '2.0', id: null, error: { code: -32000, message: `Child "${this.slug}" exited` } };
      for (const [, resolve] of this.pending) resolve(err);
      this.pending.clear();
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    if (!this.isAlive) throw new Error(`Backing server "${this.slug}" exited immediately.`);
  }

  get isAlive(): boolean {
    return this.child != null && !this.child.killed && this.child.exitCode === null;
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<JsonRpcResponse> {
    const id = `${this.namespace}-${this.nextId++}`;
    return this.send({ jsonrpc: '2.0', id, method, params }) as Promise<JsonRpcResponse>;
  }

  async notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
    await this.send({ jsonrpc: '2.0', method, params });
  }

  async initialize(params: Record<string, unknown>): Promise<void> {
    if (this.initialized) return;
    const response = await this.request('initialize', params);
    if (response.error) throw new Error(response.error.message);
    await this.notify('notifications/initialized', {});
    this.initialized = true;
  }

  private async send(message: JsonRpcRequest): Promise<unknown> {
    if (!this.isAlive) throw new Error(`Backing server "${this.slug}" is not running`);
    const hasId = message.id !== undefined && message.id !== null;

    return new Promise((resolve, reject) => {
      const line = JSON.stringify(message) + '\n';
      let timer: ReturnType<typeof setTimeout> | null = null;
      if (hasId) {
        timer = setTimeout(() => {
          this.pending.delete(message.id as string | number);
          reject(new Error(`Request to "${this.slug}" timed out after ${REQUEST_TIMEOUT_MS}ms`));
        }, REQUEST_TIMEOUT_MS);
        this.pending.set(message.id as string | number, (response) => {
          if (timer) clearTimeout(timer);
          resolve(response);
        });
      }

      this.child!.stdin!.write(line, (err) => {
        if (err) {
          if (hasId) this.pending.delete(message.id as string | number);
          reject(new Error(`Failed writing to "${this.slug}": ${err.message}`));
        } else if (!hasId) {
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

function jsonRpcToSSE(response: unknown): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(response)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function fail(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

async function buildChild(config: GatewayConfig, backend: GatewayConfig['backends'][number]): Promise<GatewayChild> {
  const meta = await getServerMetadata(backend.slug);
  const templateId = meta.definition?.template?.id;
  if (!templateId) throw new Error(`Backing server "${backend.slug}" has no template ID.`);
  const template = await getTemplate(templateId);
  if (!template.server) throw new Error(`Template "${templateId}" has no server run config.`);

  const credentials = await loadCredentials(backend.slug);
  const templateInputs = meta.definition?.template?.inputs ?? {};
  const runConfig = interpolateRunConfig(template.server, { ...templateInputs, ...credentials });
  const hostLogPath = path.join(getServerDir(backend.slug), 'host.log');
  await fs.ensureFile(hostLogPath);
  await fs.appendFile(
    hostLogPath,
    `\n--- ${new Date().toISOString()} gateway ${config.slug} attached as ${backend.namespace} ---\n`,
  );
  return new GatewayChild(backend.slug, backend.namespace, runConfig.command, runConfig.args, runConfig.env ?? {});
}

export async function startGatewayHost(opts: GatewayHostOptions): Promise<void> {
  const { slug, port, authKey, bindHost = '127.0.0.1' } = opts;
  const config = await getGateway(slug);
  const children: GatewayChild[] = [];
  const toolOwners = new Map<string, { child: GatewayChild; originalName: string }>();
  const identities = new WeakMap<Request, RequestIdentity>();
  let initializeParams: Record<string, unknown> | null = null;

  logger.info(`Starting gateway "${slug}" on ${bindHost}:${port}`);

  for (const backend of config.backends) {
    const child = await buildChild(config, backend);
    await child.start();
    children.push(child);
    logger.info(`Gateway child ready: ${backend.namespace} -> ${backend.slug} (pid=${child.pid ?? 'unknown'})`);
  }

  const RATE_LIMIT = Math.max(1, parseInt(process.env.MCP_RATE_LIMIT || '120', 10));
  const RATE_WINDOW_MS = Math.max(1000, parseInt(process.env.MCP_RATE_WINDOW_SEC || '60', 10) * 1000);
  const dataDir = getGatewayDataDir(slug);
  await fs.ensureDir(dataDir);
  const rateStatePath = path.join(dataDir, 'rate-state.json');
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
    if (now - windowStart > RATE_WINDOW_MS) {
      reqCount = 0;
      windowStart = now;
    }
    reqCount += 1;
    await saveRateState();
    return reqCount <= RATE_LIMIT;
  }

  const auditPath = path.join(dataDir, 'audit.log');
  async function audit(tool: string, details: Record<string, unknown>): Promise<void> {
    const line = JSON.stringify({ ts: new Date().toISOString(), tool, transport: 'gateway', gateway: slug, ...details }) + '\n';
    await fs.appendFile(auditPath, line).catch(() => {});
  }

  async function ensureChildrenInitialized(): Promise<void> {
    if (!initializeParams) return;
    await Promise.all(children.map((child) => child.initialize(initializeParams!)));
  }

  async function listTools(id: string | number | null): Promise<JsonRpcResponse> {
    await ensureChildrenInitialized();
    const tools: unknown[] = [];
    toolOwners.clear();

    for (const child of children) {
      const response = await child.request('tools/list', {});
      if (response.error) {
        await audit('gateway_tools_list_error', { backend: child.slug, reason: response.error.message });
        continue;
      }
      const childTools = ((response.result as { tools?: unknown[] } | undefined)?.tools ?? []) as Array<Record<string, unknown>>;
      for (const tool of childTools) {
        const originalName = String(tool.name ?? '');
        if (!originalName) continue;
        const namespacedName = `${child.namespace}.${originalName}`;
        toolOwners.set(namespacedName, { child, originalName });
        tools.push({ ...tool, name: namespacedName, description: `[${child.slug}] ${String(tool.description ?? '')}`.trim() });
      }
    }
    await audit('gateway_tools_list', { tools: tools.length, backends: children.length });
    return ok(id, { tools });
  }

  async function callTool(req: JsonRpcRequest, identity: RequestIdentity): Promise<JsonRpcResponse> {
    await ensureChildrenInitialized();
    const params = (req.params ?? {}) as { name?: unknown; arguments?: unknown };
    const namespacedName = String(params.name ?? '');
    if (!toolOwners.has(namespacedName)) {
      await listTools(req.id ?? null);
    }
    const owner = toolOwners.get(namespacedName);
    if (!owner) return fail(req.id ?? null, -32602, `Unknown gateway tool "${namespacedName}". Next: call tools/list.`);

    const args = params.arguments ?? {};
    const decision = evaluatePolicy({
      profile: identity.profile,
      gateway: slug,
      toolName: namespacedName,
      args,
    });

    if (decision.effect === 'deny') {
      await audit('gateway_policy_deny', { toolName: namespacedName, backend: owner.child.slug, profile: identity.profile?.slug, reason: decision.reason });
      return fail(req.id ?? null, -32001, `Policy denied ${namespacedName}: ${decision.reason}`);
    }

    if (decision.effect === 'approve' && identity.profile) {
      const argumentsHash = await hashArgs(args);
      const denied = await findDeniedMatchingApproval({
        gateway: slug,
        profile: identity.profile.slug,
        toolName: namespacedName,
        argumentsHash,
      });
      if (denied) {
        await audit('gateway_approval_denied', { approvalId: denied.id, toolName: namespacedName, backend: owner.child.slug, profile: identity.profile.slug });
        return fail(req.id ?? null, -32002, `Tool call was denied by human approval (${denied.id}).`);
      }
      const approved = await consumeMatchingApproval({
        gateway: slug,
        profile: identity.profile.slug,
        toolName: namespacedName,
        argumentsHash,
      });
      if (!approved) {
        const approval = await queueApproval({
          gateway: slug,
          profile: identity.profile.slug,
          toolName: namespacedName,
          backend: owner.child.slug,
          argumentsPreview: previewArgs(args),
          argumentsHash,
        });
        await audit('gateway_approval_pending', { approvalId: approval.id, toolName: namespacedName, backend: owner.child.slug, profile: identity.profile.slug, reason: decision.reason });
        return ok(req.id ?? null, {
          pendingApproval: true,
          approvalId: approval.id,
          toolName: namespacedName,
          message: `Tool call requires approval. Run: hoolix approvals approve ${approval.id}`,
        });
      }
      await audit('gateway_approval_consumed', { approvalId: approved.id, toolName: namespacedName, backend: owner.child.slug, profile: identity.profile.slug });
    } else if (decision.effect === 'approve' && !identity.profile) {
      await audit('gateway_policy_approval_skipped', { toolName: namespacedName, backend: owner.child.slug, reason: 'gateway key has no profile identity' });
    }

    await audit('gateway_tool_call', { toolName: namespacedName, backend: owner.child.slug, profile: identity.profile?.slug, authType: identity.authType });
    const response = await owner.child.request('tools/call', {
      name: owner.originalName,
      arguments: args,
    });
    return { ...response, id: req.id ?? null };
  }

  async function handle(req: JsonRpcRequest, identity: RequestIdentity): Promise<JsonRpcResponse | null> {
    const id = req.id ?? null;
    switch (req.method) {
      case 'initialize':
        initializeParams = (req.params ?? {}) as Record<string, unknown>;
        return ok(id, {
          protocolVersion: String((initializeParams as { protocolVersion?: unknown }).protocolVersion ?? '2024-11-05'),
          capabilities: { tools: {} },
          serverInfo: { name: `hoolix-gateway-${slug}`, version: '0.1.0' },
        });
      case 'notifications/initialized':
        await ensureChildrenInitialized();
        return null;
      case 'ping':
        return ok(id, {});
      case 'tools/list':
        return listTools(id);
      case 'tools/call':
        return callTool(req, identity);
      default:
        return fail(id, -32601, `Gateway does not implement "${req.method ?? 'unknown'}".`);
    }
  }

  const healthTimer = setInterval(() => {
    for (const child of children) {
      if (child.isAlive) child.request('ping', {}).catch(() => {});
    }
  }, HEALTH_PING_INTERVAL_MS);
  if (healthTimer.unref) healthTimer.unref();

  const app = new Hono();

  app.get('/health', (c) => c.json({
    status: children.every((child) => child.isAlive) ? 'ok' : 'degraded',
    gateway: slug,
    mode: 'gateway',
    backends: children.map((child) => ({ slug: child.slug, namespace: child.namespace, running: child.isAlive, pid: child.pid })),
  }));

  app.use('/mcp', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const headerKey = authHeader?.match(/^Bearer\s+/i)
      ? authHeader.replace(/^Bearer\s+/i, '')
      : c.req.header('X-MCP-Key');
    let identity: RequestIdentity | null = null;
    if (headerKey === authKey) {
      identity = { profile: null, authType: 'gateway' };
    } else if (headerKey) {
      const profile = await findProfileByAuthKey(headerKey);
      if (profile) identity = { profile, authType: 'profile' };
    }

    if (!identity) {
      return c.json({ error: 'Unauthorized. Provide valid Authorization: Bearer <key> or X-MCP-Key header.' }, 401);
    }
    identities.set(c.req.raw, identity);
    if (!(await checkRateLimit())) {
      await audit('rate_limited', { limit: RATE_LIMIT, windowSec: Math.floor(RATE_WINDOW_MS / 1000) });
      c.header('Retry-After', String(Math.ceil(RATE_WINDOW_MS / 1000)));
      return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429);
    }
    await next();
    return;
  });

  app.all('/mcp', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(fail(null, -32700, 'Parse error — invalid JSON body'), 400);
    }

    const preferSSE = (c.req.header('Accept') ?? '').includes('text/event-stream');
    try {
      if (Array.isArray(body)) {
        const identity = identities.get(c.req.raw) ?? { profile: null, authType: 'gateway' };
        const responses = (await Promise.all(body.map((item) => handle(item as JsonRpcRequest, identity)))).filter(Boolean);
        return preferSSE ? jsonRpcToSSE(responses) : c.json(responses);
      }
      const identity = identities.get(c.req.raw) ?? { profile: null, authType: 'gateway' };
      const response = await handle(body as JsonRpcRequest, identity);
      if (response === null) return new Response(null, { status: 204 });
      return preferSSE ? jsonRpcToSSE(response) : c.json(response);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      await audit('gateway_error', { reason: message });
      const response = fail((body as JsonRpcRequest)?.id ?? null, -32603, message);
      return preferSSE ? jsonRpcToSSE(response) : c.json(response, 500);
    }
  });

  const runtimePath = getGatewayRuntimePath(slug);
  await fs.writeJson(runtimePath, {
    pid: process.pid,
    port,
    startedAt: new Date().toISOString(),
    status: 'running',
    mode: 'gateway',
    backends: children.map((child) => ({ slug: child.slug, namespace: child.namespace, pid: child.pid })),
  }, { spaces: 2 });

  const shutdown = async () => {
    clearInterval(healthTimer);
    for (const child of children) child.kill();
    await fs.remove(runtimePath).catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info(`Gateway ready at http://${bindHost}:${port}/mcp`);
  serve({ fetch: app.fetch, port, hostname: bindHost });
}

function readCliArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

if (process.argv.includes('--slug') && process.argv.includes('--port') && process.argv.includes('--auth-key')) {
  const slug = readCliArg('slug');
  const port = readCliArg('port');
  const authKey = readCliArg('auth-key');
  if (slug && port && authKey) {
    startGatewayHost({ slug, port: parseInt(port, 10), authKey }).catch((err: unknown) => {
      const message = err instanceof Error ? err.stack || err.message : String(err);
      process.stderr.write(`Gateway host failed: ${message}\n`);
      process.exit(1);
    });
  }
}
