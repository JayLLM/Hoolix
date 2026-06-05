/**
 * Credential management for mcp-server kind templates.
 *
 * Sensitive values (API tokens, connection strings) are stored in a separate
 * credentials.json per server with 0600 permissions — never in metadata.json.
 * The metadata.json only records which credential keys exist (credentialKeys[]).
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import { text, isCancel } from '@clack/prompts';
import { getServerDir } from '../../core/paths.js';
import { logger } from '../../core/logger.js';
import { CredentialMissingError } from '../../core/errors.js';
import type { CatalogTemplate } from '../../catalog/templates.js';

const CREDENTIALS_FILE = 'credentials.json';
const CREDENTIALS_MODE = 0o600;

function getCredentialsPath(slug: string): string {
  return path.join(getServerDir(slug), CREDENTIALS_FILE);
}

function maskValue(value: string, visible = 6): string {
  if (!value) return '';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

// ── Persistence ───────────────────────────────────────────────────────────────

export async function saveCredentials(
  slug: string,
  credentials: Record<string, string>,
): Promise<void> {
  await fs.ensureDir(getServerDir(slug));
  const credPath = getCredentialsPath(slug);
  await fs.writeJson(credPath, credentials, { spaces: 2 });
  // 0600: owner read/write only. On Windows, chmod is a no-op; tighten with icacls.
  await fs.chmod(credPath, CREDENTIALS_MODE).catch(() => {});
  if (process.platform === 'win32') {
    tightenCredentialsAclWin(credPath).catch(() => {});
  }
}

/** Remove inherited ACLs on Windows so only the current user can read credentials.json. */
async function tightenCredentialsAclWin(filePath: string): Promise<void> {
  const username = process.env.USERNAME || process.env.USER || '';
  if (!username) return;
  await new Promise<void>((resolve) => {
    const child = spawn('icacls', [filePath, '/inheritance:r', '/grant:r', `${username}:(R,W)`], {
      stdio: 'ignore',
      shell: false,
    });
    child.on('close', () => resolve());
    child.on('error', () => resolve()); // icacls missing is non-fatal
  });
}

export async function loadCredentials(slug: string): Promise<Record<string, string>> {
  const credPath = getCredentialsPath(slug);
  if (!(await fs.pathExists(credPath))) return {};
  try {
    const raw = await fs.readJson(credPath);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, string>;
    }
    return {};
  } catch {
    logger.debug(`Failed to load credentials.json for ${slug}`);
    return {};
  }
}

export async function deleteCredentials(slug: string): Promise<void> {
  await fs.remove(getCredentialsPath(slug)).catch(() => {});
}

/**
 * Set a single credential key. Creates or overwrites the key; leaves others intact.
 * Updates credentialKeys in server metadata to reflect the new set.
 */
export async function updateCredential(
  slug: string,
  key: string,
  value: string,
): Promise<string[]> {
  const existing = await loadCredentials(slug);
  const updated = { ...existing, [key]: value };
  await saveCredentials(slug, updated);
  const keys = Object.keys(updated);
  // Lazily import registry to avoid circular dependency at module load time
  const { updateServerMetadata } = await import('../../core/registry.js');
  await updateServerMetadata(slug, { credentialKeys: keys });
  return keys;
}

/**
 * Remove a single credential key. Deletes credentials.json entirely if it becomes empty.
 * Updates credentialKeys in server metadata.
 */
export async function removeCredential(
  slug: string,
  key: string,
): Promise<string[]> {
  const existing = await loadCredentials(slug);
  if (!(key in existing)) return Object.keys(existing);
  delete existing[key];
  if (Object.keys(existing).length === 0) {
    await deleteCredentials(slug);
  } else {
    await saveCredentials(slug, existing);
  }
  const keys = Object.keys(existing);
  const { updateServerMetadata } = await import('../../core/registry.js');
  await updateServerMetadata(slug, { credentialKeys: keys });
  return keys;
}

// ── Masking ───────────────────────────────────────────────────────────────────

export function maskCredentials(
  credentials: Record<string, string>,
  template?: CatalogTemplate,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(credentials).map(([key, value]) => {
      const def = template?.credentials.find((c) => c.name === key);
      return [key, def?.sensitive !== false ? maskValue(value) : value];
    }),
  );
}

// ── Prompting ─────────────────────────────────────────────────────────────────

export async function promptCredentials(
  template: CatalogTemplate,
  options: {
    provided?: Record<string, string>;
    env?: NodeJS.ProcessEnv;
    nonInteractive?: boolean;
  } = {},
): Promise<Record<string, string>> {
  const result: Record<string, string> = { ...(options.provided ?? {}) };
  const env = options.env ?? process.env;

  for (const cred of template.credentials) {
    if (result[cred.name]) continue;

    // Auto-detect from environment (uses envVar hint, e.g. GITHUB_TOKEN)
    const fromEnv = cred.envVar ? env[cred.envVar] : undefined;
    if (fromEnv) {
      logger.info(`Using ${cred.envVar} from environment for "${cred.label}"`);
      result[cred.name] = fromEnv;
      continue;
    }

    if (!cred.required) continue;

    if (options.nonInteractive) {
      throw new CredentialMissingError(cred.name, cred.envVar);
    }

    const hint = cred.validationHint ? ` (${cred.validationHint})` : '';
    const docsNote = cred.docsUrl ? `\n  Docs: ${cred.docsUrl}` : '';
    const raw = await text({
      message: `${cred.label}${hint}${docsNote}`,
      placeholder: cred.placeholder ?? (cred.sensitive ? '••••••••' : ''),
      validate: (v) => (v && v.trim().length > 0 ? undefined : `${cred.label} is required`),
    });
    if (isCancel(raw)) {
      // caller handles cancel by catching or checking process exit
      throw new CredentialMissingError(cred.name, cred.envVar);
    }
    result[cred.name] = String(raw).trim();
  }

  return result;
}

// ── Interpolation ─────────────────────────────────────────────────────────────

export function interpolateString(
  template: string,
  substitutions: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => substitutions[key] ?? match);
}

/**
 * Interpolate {credential} and {input} placeholders in a server run config.
 * Call at connect/start time with merged inputs + loaded credentials.
 */
export function interpolateRunConfig(
  server: { command: string; args: string[]; env: Record<string, string> },
  substitutions: Record<string, string>,
): { command: string; args: string[]; env: Record<string, string> } {
  return {
    command: server.command,
    args: server.args.map((arg) => interpolateString(arg, substitutions)),
    env: Object.fromEntries(
      Object.entries(server.env).map(([k, v]) => [k, interpolateString(v, substitutions)]),
    ),
  };
}
