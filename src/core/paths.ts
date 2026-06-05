import envPaths from 'env-paths';
import path from 'node:path';
import fs from 'fs-extra';

const APP_NAME = 'hoolix';
const DATA_DIR_ENV = 'MCP_PORTAL_DATA_DIR';

export interface AppPaths {
  data: string;    // root data dir (env-paths based, cross platform)
  config: string;
  servers: string; // per-slug dirs live here
  gateways: string; // per-gateway dirs live here
  profiles: string; // profile configs live here
  cache: string;
}

let cachedPaths: AppPaths | null = null;

export function getPaths(): AppPaths {
  if (cachedPaths) return cachedPaths;

  const paths = envPaths(APP_NAME, { suffix: '' });

  // CI/e2e tests must never touch a developer's real env-paths directory.
  // Keep the override centralized here so registry, RAG, host, TUI, and CLI commands
  // all share the same isolated filesystem root without test-only branches elsewhere.
  const data = process.env[DATA_DIR_ENV] || paths.data;
  const servers = path.join(data, 'servers');
  const gateways = path.join(data, 'gateways');
  const profiles = path.join(data, 'profiles');
  const config = path.join(data, 'config.json');
  const cache = path.join(data, 'cache');

  cachedPaths = {
    data,
    config,
    servers,
    gateways,
    profiles,
    cache,
  };

  return cachedPaths;
}

export function resetPathsForTests(): void {
  cachedPaths = null;
}

export async function ensureDirectories(): Promise<AppPaths> {
  const p = getPaths();
  await fs.ensureDir(p.data);
  await fs.ensureDir(p.servers);
  await fs.ensureDir(p.gateways);
  await fs.ensureDir(p.profiles);
  await fs.ensureDir(p.cache);
  return p;
}

export function getServerDir(slug: string): string {
  return path.join(getPaths().servers, slug);
}

export function getServerMetadataPath(slug: string): string {
  return path.join(getServerDir(slug), 'metadata.json');
}

export function getServerDataDir(slug: string): string {
  return path.join(getServerDir(slug), 'data');
}

export function getServerRuntimePath(slug: string): string {
  return path.join(getServerDir(slug), '.runtime.json');
}

export function getServerCredentialsPath(slug: string): string {
  return path.join(getServerDir(slug), 'credentials.json');
}

export function getGatewayDir(name: string): string {
  return path.join(getPaths().gateways, name);
}

export function getGatewayConfigPath(name: string): string {
  return path.join(getGatewayDir(name), 'gateway.json');
}

export function getGatewayRuntimePath(name: string): string {
  return path.join(getGatewayDir(name), '.runtime.json');
}

export function getGatewayDataDir(name: string): string {
  return path.join(getGatewayDir(name), 'data');
}

export function getProfileDir(name: string): string {
  return path.join(getPaths().profiles, name);
}

export function getProfileConfigPath(name: string): string {
  return path.join(getProfileDir(name), 'profile.json');
}

export function getApprovalsPath(): string {
  return path.join(getPaths().data, 'approvals.json');
}
