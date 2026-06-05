import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
  combined: string;
}

export interface CliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  input?: string;
}

export function makeTempDataDir(prefix = 'hoolix-e2e-'): string {
  return path.join(os.tmpdir(), `${prefix}${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export async function runCli(args: string[], options: CliOptions = {}): Promise<CliResult> {
  const cwd = options.cwd || process.cwd();
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts', ...args], {
    cwd,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      MCP_PORTAL_SKIP_UPDATE_CHECK: '1',
      // Allow fixture servers on loopback in e2e tests (never set in production).
      MCP_PORTAL_DISABLE_SSRF_GUARD: '1',
      ...options.env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  const timeout = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs || 45_000);

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  if (options.input) child.stdin.write(options.input);
  child.stdin.end();

  const [code] = await once(child, 'exit') as [number | null, NodeJS.Signals | null];
  clearTimeout(timeout);

  return { code, stdout, stderr, combined: `${stdout}\n${stderr}` };
}

export async function withTempPortalData<T>(fn: (dataDir: string) => Promise<T>): Promise<T> {
  const dataDir = makeTempDataDir();
  await fs.ensureDir(dataDir);
  try {
    return await fn(dataDir);
  } finally {
    await fs.remove(dataDir).catch(() => {});
  }
}

export async function getFreePort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('free port probe did not bind to a TCP port');
  }
  const port = address.port;
  server.close();
  await once(server, 'close').catch(() => {});
  return port;
}

export interface FixtureServer {
  url: string;
  close: () => Promise<void>;
}

export async function startDocsFixtureServer(): Promise<FixtureServer> {
  const markdown = `# Fixture Docs\n\nThis fixture verifies hoolix end to end flows.\n\n## Model Context Protocol\n\nThe Model Context Protocol server exposes grounded documentation search results with source URLs.\n\n## Rotation\n\nAuth keys can be rotated and clients should reconnect with the new bearer token.\n\n## Connection\n\nUse streamable HTTP clients to connect to the generated MCP endpoint.\n\n## Overview install api configuration authentication usage\n\nThis overview explains install steps, api usage, configuration files, authentication, and getting started workflows for agents.\n`;

  const server = http.createServer((req, res) => {
    if (req.url === '/docs.md' || req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
      res.end(markdown);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server did not bind to a TCP port');

  return {
    url: `http://127.0.0.1:${address.port}/docs.md`,
    close: async () => {
      server.close();
      await once(server, 'close').catch(() => {});
    },
  };
}
