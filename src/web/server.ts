import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from '../core/logger.js';
import {
  listServers,
  getServerMetadata,
  registerServer,
  deleteServer,
  updateServerMetadata,
  slugify,
} from '../core/registry.js';
import { serverManager } from '../process/manager.js';
import { ingestDocumentation } from '../ingestion/pipeline.js';
import { createRAGForServer } from '../rag/store.js';
import { SUPPORTED_EMBEDDING_MODELS, isHybridModel } from '../rag/models.js';
import type { EmbeddingModel } from '../rag/models.js';
import { getPaths, ensureDirectories, getServerDir } from '../core/paths.js';
import fs from 'fs-extra';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { buildDashboardHtml } from './assets.js';

const GUI_TOKEN_FILE = '.gui-token';

function generateGuiToken(): string {
  return 'gui_' + randomBytes(24).toString('hex');
}

async function getOrCreateGuiToken(): Promise<string> {
  await ensureDirectories();
  const p = path.join(getPaths().data, GUI_TOKEN_FILE);
  if (await fs.pathExists(p)) {
    const t = (await fs.readFile(p, 'utf8')).trim();
    if (t) return t;
  }
  const token = generateGuiToken();
  await fs.writeFile(p, token, { mode: 0o600 });
  return token;
}

function generateAuthKey(): string {
  return 'mcp_' + randomBytes(24).toString('hex');
}

function maskSecret(value: string, visible = 6): string {
  if (!value) return '';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

function maskServerMetadata<T extends { authKey?: string }>(meta: T): T {
  return {
    ...meta,
    authKey: meta.authKey ? maskSecret(meta.authKey) : meta.authKey,
  };
}

function openBrowser(url: string) {
  const platform = process.platform;
  let cmd: string;
  if (platform === 'win32') {
    cmd = `start "" "${url.replace(/"/g, '\\"')}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${url.replace(/"/g, '\\"')}"`;
  } else {
    cmd = `xdg-open "${url.replace(/"/g, '\\"')}"`;
  }
  try {
    execSync(cmd, { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

async function canBind(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export async function resolveGuiPort(host: string, requestedPort: number, strict: boolean): Promise<number> {
  if (await canBind(host, requestedPort)) return requestedPort;

  if (strict) {
    throw new Error(
      `Port ${requestedPort} is already in use on ${host}. Next: stop the other process or run hoolix gui --port ${requestedPort + 1}.`
    );
  }

  for (let port = requestedPort + 1; port < requestedPort + 50; port++) {
    if (await canBind(host, port)) return port;
  }

  throw new Error(
    `Could not find a free Web GUI port near ${requestedPort}. Next: pass hoolix gui --port <free-port>.`
  );
}

function createApp(token: string) {
  const app = new Hono();

  // Auth middleware for protected API
  app.use('/api/*', async (c, next) => {
    const provided =
      c.req.query('token') ||
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ||
      '';
    if (provided !== token) {
      return c.json({ error: 'Unauthorized. Provide ?token= or Authorization: Bearer <gui-token>' }, 401);
    }
    return await next();
  });

  app.get('/health', (c) => c.json({ status: 'ok', service: 'hoolix-gui' }));

  // List servers + live status
  app.get('/api/servers', async (c) => {
    const servers = await listServers();
    const enriched = [];
    for (const s of servers) {
      const st = await serverManager.getStatus(s.slug);
      enriched.push({
        ...maskServerMetadata(s),
        running: st.running,
        port: st.port,
        pid: st.pid,
      });
    }
    return c.json(enriched);
  });

  // Create server (non-interactive)
  app.post('/api/servers', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const name = (body.name || '').trim();
    const url = (body.url || '').trim();
    if (!name || !url) {
      return c.json({ error: 'name and url are required' }, 400);
    }

    const slug = slugify(name);
    try {
      await getServerMetadata(slug);
      return c.json({ error: 'server already exists' }, 409);
    } catch {}

    let result;
    try {
      result = await ingestDocumentation(url, { maxChunks: 6000, maxPages: 80 });
    } catch (e: any) {
      return c.json({ error: 'ingestion failed: ' + (e.message || e) }, 400);
    }

    let embeddingModel: EmbeddingModel = 'fuse';
    if (body.hybrid || body.embeddingModel) {
      const cand = body.embeddingModel || 'hybrid-bge-small';
      embeddingModel = (SUPPORTED_EMBEDDING_MODELS as string[]).includes(cand) ? (cand as EmbeddingModel) : 'hybrid-bge-small';
    }

    const meta = await registerServer({
      name,
      slug,
      sourceUrl: result.sourceUrl,
      sourceType: result.sourceType,
      ingestionVersion: '1.0.0',
      embeddingModel,
      chunkCount: result.stats.totalChunks,
      ingestionStats: result.stats,
      vectorIndexed: isHybridModel(embeddingModel),
      authKey: generateAuthKey(),
      desiredState: 'stopped',
    });

    try {
      const rag = await createRAGForServer(slug, embeddingModel);
      await rag.indexChunks(result.chunks as any, { embeddingModel });
      await (rag as any).close?.();
    } catch (e: any) {
      logger.warn(`GUI create: RAG indexing warning for ${slug}: ${e.message || e}`);
    }

    return c.json({ ok: true, slug, meta: maskServerMetadata(meta) });
  });

  // Start
  app.post('/api/servers/:slug/start', async (c) => {
    const slug = c.req.param('slug');
    try {
      const res = await serverManager.start(slug);
      return c.json({ ok: true, ...res, authKey: maskSecret(res.authKey) });
    } catch (e: any) {
      return c.json({ error: e.message || String(e) }, 400);
    }
  });

  // Stop
  app.post('/api/servers/:slug/stop', async (c) => {
    const slug = c.req.param('slug');
    const ok = await serverManager.stop(slug);
    return c.json({ ok });
  });

  // Reindex
  app.post('/api/servers/:slug/reindex', async (c) => {
    const slug = c.req.param('slug');
    const body = await c.req.json().catch(() => ({}));
    const meta = await getServerMetadata(slug);

    let em = meta.embeddingModel as EmbeddingModel;
    if (body.hybrid) em = 'hybrid-bge-small';
    if (body.embeddingModel && (SUPPORTED_EMBEDDING_MODELS as string[]).includes(body.embeddingModel)) {
      em = body.embeddingModel as EmbeddingModel;
    }

    const result = await ingestDocumentation(meta.sourceUrl, { maxChunks: 6000, maxPages: 80 });

    const rag = await createRAGForServer(slug, em);
    await rag.indexChunks(result.chunks as any, { embeddingModel: em });
    await (rag as any).close?.();

    await updateServerMetadata(slug, {
      chunkCount: result.stats.totalChunks,
      ingestionStats: result.stats,
      embeddingModel: em,
      vectorIndexed: isHybridModel(em),
    });

    return c.json({ ok: true, chunks: result.stats.totalChunks });
  });

  // Verify (basic)
  app.get('/api/servers/:slug/verify', async (c) => {
    const slug = c.req.param('slug');
    const meta = await getServerMetadata(slug);
    const em = meta.embeddingModel as EmbeddingModel;
    const rag = await createRAGForServer(slug, em);

    const samples = ['overview', 'install', 'api'];
    const out = [];
    for (const q of samples) {
      const hits = await rag.search(q, { limit: 2, mode: 'hybrid' });
      out.push({ query: q, hits });
    }
    return c.json({ ok: true, samples: out, embeddingModel: em });
  });

  // Playground search (uses RAG directly for demo)
  app.post('/api/servers/:slug/search', async (c) => {
    const slug = c.req.param('slug');
    const body = await c.req.json().catch(() => ({}));
    const meta = await getServerMetadata(slug).catch(() => null);
    const em = (meta?.embeddingModel || 'fuse') as EmbeddingModel;

    const rag = await createRAGForServer(slug, em);
    const results = await rag.search(body.query || 'test', {
      limit: Math.min(body.limit || 5, 10),
      mode: body.mode || 'hybrid',
      alpha: body.alpha,
      reranker: body.reranker,
    });
    return c.json({ results });
  });

  // Delete
  app.delete('/api/servers/:slug', async (c) => {
    const slug = c.req.param('slug');
    await deleteServer(slug, { removeData: true });
    return c.json({ ok: true });
  });

  // Rotate
  app.post('/api/servers/:slug/rotate', async (c) => {
    const slug = c.req.param('slug');
    const newKey = generateAuthKey();
    await updateServerMetadata(slug, { authKey: newKey } as any);
    return c.json({ ok: true, newKey, note: 'Stop and restart the server to pick up the new key.' });
  });

  // Single server info + status
  app.get('/api/servers/:slug', async (c) => {
    const slug = c.req.param('slug');
    const meta = await getServerMetadata(slug);
    const st = await serverManager.getStatus(slug);
    return c.json({ ...maskServerMetadata(meta), ...st });
  });

  // Simple logs tail
  app.get('/api/servers/:slug/logs', async (c) => {
    const slug = c.req.param('slug');
    const logPath = path.join(getServerDir(slug), 'host.log');
    try {
      const content = await fs.readFile(logPath, 'utf8');
      return c.text(content.slice(-8000) || '(empty)');
    } catch {
      return c.text('(no host.log yet for this server)');
    }
  });

  // Root UI
  app.get('/', (c) => {
    const t = c.req.query('token') || '';
    return c.html(buildDashboardHtml(t));
  });

  return app;
}

export async function launchWebGui(opts: { port?: number; host?: string; open?: boolean; token?: string; strictPort?: boolean } = {}) {
  const requestedPort = opts.port || 8080;
  const host = opts.host || '127.0.0.1';
  const shouldOpen = opts.open !== false;
  let token = opts.token;

  if (!token) {
    token = await getOrCreateGuiToken();
  }

  const port = await resolveGuiPort(host, requestedPort, opts.strictPort === true);
  const urlBase = `http://${host}:${port}`;
  const fullUrl = `${urlBase}/?token=${token}`;
  const displayUrl = `${urlBase}/?token=${maskSecret(token)}`;

  logger.info(`Starting Hoolix Web GUI`);
  console.log(`\n◆ Hoolix Web GUI (beta)`);
  if (port !== requestedPort) {
    console.log(`  Port ${requestedPort} is in use; using ${port} instead.`);
  }
  console.log(`  Open: ${displayUrl}`);
  if (host !== '127.0.0.1') {
    console.log(`  WARNING: Listening on ${host}. Protect this port!`);
  }
  console.log(`  Token: ${maskSecret(token)} (full token is stored in your local hoolix data directory)`);

  if (shouldOpen) {
    openBrowser(fullUrl);
  }

  const app = createApp(token);

  try {
    serve({
      fetch: app.fetch,
      port,
      hostname: host,
    } as any);
  } catch (e: any) {
    throw new Error(e?.message || `Failed to start Web GUI on ${host}:${port}. Next: try hoolix gui --port ${port + 1}.`);
  }

  console.log(`\nWeb GUI is running. Use Ctrl+C to stop.`);
  // Keep alive
  await new Promise(() => {});
}
