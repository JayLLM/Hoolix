import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import net from 'node:net';
import { getServerRuntimePath, getServerDir, getServerMetadataPath } from '../core/paths.js';
import { logger } from '../core/logger.js';
import treeKill from 'tree-kill';
import psList from 'ps-list';

export interface StartOptions {
  port?: number;
  authKey?: string;
  detach?: boolean;
}

export interface ServerStatus {
  running: boolean;
  pid?: number;
  port?: number;
  startedAt?: string;
}

export interface HostSpawnPlanInput {
  slug: string;
  port: number;
  dataDir: string;
  authKey: string;
  execPath?: string;
  platform?: NodeJS.Platform;
  cwd?: string;
  tsxExists?: boolean;
}

export interface HostSpawnPlan {
  command: string;
  args: string[];
  mode: 'binary' | 'dev-tsx-bin' | 'dev-node-import';
}

const BASE_PORT = 3456;

export function buildHostSpawnPlan(input: HostSpawnPlanInput): HostSpawnPlan {
  const currentBin = input.execPath || process.execPath;
  const isNodeOrBun = currentBin.includes('node') || currentBin.includes('bun');
  const root = input.cwd || process.cwd();
  const hostScript = path.resolve(root, 'src/mcp/host.ts');

  if (!isNodeOrBun) {
    return {
      command: currentBin,
      args: [
        '__internal-host',
        '--slug', input.slug,
        '--port', String(input.port),
        '--data-dir', input.dataDir,
        '--auth-key', input.authKey,
      ],
      mode: 'binary',
    };
  }

  const platform = input.platform || process.platform;
  if (platform === 'win32') {
    return {
      command: currentBin,
      args: [
        '--import', 'tsx',
        hostScript,
        '--slug', input.slug,
        '--port', String(input.port),
        '--data-dir', input.dataDir,
        '--auth-key', input.authKey,
      ],
      mode: 'dev-node-import',
    };
  }

  const tsxBin = path.resolve(root, 'node_modules', '.bin', 'tsx');
  const tsxExists = input.tsxExists ?? fs.pathExistsSync(tsxBin);
  if (tsxExists) {
    return {
      command: tsxBin,
      args: [
        hostScript,
        '--slug', input.slug,
        '--port', String(input.port),
        '--data-dir', input.dataDir,
        '--auth-key', input.authKey,
      ],
      mode: 'dev-tsx-bin',
    };
  }

  return {
    command: currentBin,
    args: [
      '--import', 'tsx',
      hostScript,
      '--slug', input.slug,
      '--port', String(input.port),
      '--data-dir', input.dataDir,
      '--auth-key', input.authKey,
    ],
    mode: 'dev-node-import',
  };
}

export class ServerManager {
  /**
   * Start a server by spawning the MCP host (binary or dev tsx path).
   * Handles early runtime marker, health probe, and Windows process checks.
   */
  async start(slug: string, opts: StartOptions = {}): Promise<{ port: number; authKey: string; pid: number }> {
    const runtimePath = getServerRuntimePath(slug);

    // Return existing if .runtime.json + ps check says it's alive
    const existing = await this.getStatus(slug);
    if (existing.running && existing.port && existing.pid) {
      const meta = await this.getMetadata(slug);
      return { port: existing.port, authKey: meta.authKey, pid: existing.pid };
    }

    const dataDir = path.join(getServerDir(slug), 'data');
    const meta = await this.getMetadata(slug);

    const port = opts.port || await this.findFreePort(BASE_PORT + Math.floor(Math.random() * 400));
    const authKey = opts.authKey || meta.authKey;

    const hostLogPath = path.join(getServerDir(slug), 'host.log');

    logger.info(`Spawning MCP host for "${slug}" on port ${port}...`);

    // Early "starting" marker so concurrent status checks see progress
    await fs.writeJson(runtimePath, {
      pid: -1,
      port,
      startedAt: new Date().toISOString(),
      status: 'starting',
    }, { spaces: 2 });

    const spawnPlan = buildHostSpawnPlan({ slug, port, dataDir, authKey });

    await fs.ensureFile(hostLogPath);
    await fs.appendFile(hostLogPath, `\n--- ${new Date().toISOString()} start ${slug} on :${port} ---\n`);
    const logFd = fs.openSync(hostLogPath, 'a');

    const child = spawn(spawnPlan.command, spawnPlan.args, {
      stdio: ['ignore', logFd, logFd],
      detached: opts.detach ?? true,
      env: { ...process.env, MCP_PORTAL_LOG_LEVEL: process.env.MCP_PORTAL_LOG_LEVEL || 'info' },
    });
    fs.closeSync(logFd);

    child.on('exit', (code, signal) => {
      if (code !== 0) {
        logger.error(`MCP host for ${slug} exited (code=${code}, signal=${signal})`);
      }
    });

    // Wait + HTTP /health probe (more reliable than relying solely on child writing .runtime.json).
    const probeOk = await this.waitForHttpHealth(port, 15000);

    if (!probeOk) {
      try { treeKill(child.pid!, 'SIGKILL'); } catch {}
      await fs.remove(runtimePath).catch(() => {});
      const tail = await this.readLogTail(hostLogPath);
      throw new Error(`Failed to start "${slug}" — health check on :${port} did not succeed.\nRecent logs:\n${tail}`);
    }

    // Authoritative runtime file written by parent after health confirmed
    const pid = child.pid!;
    await fs.writeJson(runtimePath, {
      pid,
      port,
      startedAt: new Date().toISOString(),
      status: 'running',
    }, { spaces: 2 });

    child.unref();

    return { port, authKey, pid };
  }

  async stop(slug: string, force = false): Promise<boolean> {
    const runtimePath = getServerRuntimePath(slug);
    const status = await this.getStatus(slug);

    if (!status.running || !status.pid) {
      await fs.remove(runtimePath).catch(() => {});
      return false;
    }

    return new Promise((resolve) => {
      treeKill(status.pid!, force ? 'SIGKILL' : 'SIGTERM', async (err) => {
        if (err) {
          logger.warn(`tree-kill error for ${slug}: ${err.message}`);
        }
        await fs.remove(runtimePath).catch(() => {});
        resolve(true);
      });
    });
  }

  async getStatus(slug: string): Promise<ServerStatus> {
    const runtimePath = getServerRuntimePath(slug);
    if (!(await fs.pathExists(runtimePath))) {
      return { running: false };
    }

    try {
      const data = await fs.readJson(runtimePath);
      // Verify alive via ps-list (critical on Windows where signals are limited)
      const alive = await this.isProcessAlive(data.pid);
      if (!alive) {
        await fs.remove(runtimePath).catch(() => {});
        return { running: false };
      }
      return {
        running: true,
        pid: data.pid,
        port: data.port,
        startedAt: data.startedAt,
      };
    } catch {
      await fs.remove(runtimePath).catch(() => {});
      return { running: false };
    }
  }

  private async getMetadata(slug: string) {
    const metaPath = getServerMetadataPath(slug);
    return fs.readJson(metaPath);
  }

  private async readLogTail(logPath: string): Promise<string> {
    try {
      const log = await fs.readFile(logPath, 'utf8');
      return log.slice(-2000) || '(host log was empty)';
    } catch {
      return '(host log unavailable)';
    }
  }

  /** Wait for HTTP /health to respond (authoritative liveness after spawn). */

  private async waitForHttpHealth(port: number, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    const url = `http://127.0.0.1:${port}/health`;

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(800) });
        if (res.ok) {
          logger.info(`Health check passed on :${port}`);
          return true;
        }
      } catch {
        // not ready yet; loop with backoff
      }
      await new Promise(r => setTimeout(r, 400));
    }
    return false;
  }
  private async isProcessAlive(pid: number): Promise<boolean> {
    try {
      const list = await psList();
      return list.some((p: any) => p.pid === pid);
    } catch {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    }
  }

  /** Real TCP probe (listen briefly on loopback) to find free port. Avoids races. */
  private async isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => {
        resolve(false);
      });
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      // Bind loopback only (matches host bindHost='127.0.0.1')
      server.listen(port, '127.0.0.1');
    });
  }

  private async findFreePort(startPort: number): Promise<number> {
    // Probe range to avoid collisions (real listen probe, not just math).
    for (let p = startPort; p < startPort + 200; p++) {
      if (await this.isPortFree(p)) {
        return p;
      }
    }
    // Last resort (health probe later will fail loudly if still occupied)
    logger.warn(`Could not find a free port in range ${startPort}-${startPort + 199}; using ${startPort}`);
    return startPort;
  }
}

export const serverManager = new ServerManager();
