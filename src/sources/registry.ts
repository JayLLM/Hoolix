import type { SourceType } from '../ingestion/types.js';
import {
  ServerDefinitionSchema,
  SourceDefinitionSchema,
  type ServerDefinition,
  type SourceDefinition,
  type SourceSummary,
} from './types.js';

export function createLegacyServerDefinition(sourceUrl: string, sourceType: SourceType): ServerDefinition {
  return ServerDefinitionSchema.parse({
    version: 1,
    sources: [sourceFromLegacy(sourceUrl, sourceType)],
  });
}

export function sourceFromLegacy(sourceUrl: string, sourceType: SourceType): SourceDefinition {
  if (sourceType === 'github') {
    const repo = githubRepoFromUrl(sourceUrl);
    if (repo) return { type: 'github', repo, label: repo };
  }
  if (sourceType === 'llms.txt') return { type: 'llms', url: sourceUrl, label: 'llms.txt' };
  if (sourceType === 'manual') return { type: 'manual', url: sourceUrl, label: 'manual' };
  return { type: 'docs', url: sourceUrl, label: 'docs' };
}

export function parseCliSource(value: string): SourceDefinition {
  const sep = value.indexOf(':');
  if (sep <= 0) {
    throw new Error(`Invalid --source "${value}". Next: use --source docs:https://example.com/llms.txt or --source github:owner/repo.`);
  }

  const type = value.slice(0, sep).trim().toLowerCase();
  const raw = value.slice(sep + 1).trim();
  if (!raw) {
    throw new Error(`Invalid --source "${value}". Next: provide a non-empty source value.`);
  }

  if (type === 'github' || type === 'gh') {
    return SourceDefinitionSchema.parse({
      type: 'github',
      repo: normalizeGitHubRepo(raw),
      label: normalizeGitHubRepo(raw),
    });
  }

  if (type === 'docs' || type === 'doc') {
    return SourceDefinitionSchema.parse({ type: 'docs', url: raw, label: sourceLabelFromUrl(raw) });
  }

  if (type === 'llms' || type === 'llms.txt') {
    return SourceDefinitionSchema.parse({ type: 'llms', url: raw, label: 'llms.txt' });
  }

  if (type === 'web' || type === 'site') {
    return SourceDefinitionSchema.parse({ type: 'web', url: raw, label: sourceLabelFromUrl(raw) });
  }

  if (type === 'manual') {
    return SourceDefinitionSchema.parse({ type: 'manual', url: raw, label: 'manual' });
  }

  if (type === 'custom') {
    const providerSep = raw.indexOf(':');
    if (providerSep <= 0) {
      throw new Error(`Invalid custom source "${value}". Next: use --source custom:<provider>:<value>.`);
    }
    const provider = raw.slice(0, providerSep).trim();
    const customValue = raw.slice(providerSep + 1).trim();
    return SourceDefinitionSchema.parse({ type: 'custom', provider, value: customValue, label: provider });
  }

  throw new Error(`Unsupported --source type "${type}". Next: use docs, llms, web, github, manual, or custom.`);
}

export function parseCliSources(args: string[]): SourceDefinition[] {
  const out: SourceDefinition[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Missing --source value. Next: pass --source docs:https://example.com/llms.txt.');
      }
      out.push(parseCliSource(value));
      i++;
    }
  }
  return out;
}

export function parseCliHeaders(args: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--header') continue;
    const value = args[i + 1];
    if (!value) throw new Error('Missing --header value. Next: pass --header "Authorization: Bearer <token>".');
    const sep = value.indexOf(':');
    if (sep <= 0) throw new Error(`Invalid --header "${value}". Next: use --header "Name: value".`);
    const name = value.slice(0, sep).trim();
    const headerValue = value.slice(sep + 1).trim();
    if (!name || !headerValue) throw new Error(`Invalid --header "${value}". Next: use --header "Name: value".`);
    headers[name] = headerValue;
    i++;
  }
  return headers;
}

export function parseCliCookie(args: string[]): string | undefined {
  const idx = args.indexOf('--cookie');
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

export function applySourceAuth(
  sources: SourceDefinition[],
  auth: { headers?: Record<string, string>; cookie?: string },
): SourceDefinition[] {
  const hasHeaders = auth.headers && Object.keys(auth.headers).length > 0;
  const hasCookie = !!auth.cookie;
  if (!hasHeaders && !hasCookie) return sources;
  return sources.map((source) => {
    if (source.type === 'github') return source;
    return {
      ...source,
      ...(hasHeaders ? { headers: { ...(source as any).headers, ...auth.headers } } : {}),
      ...(hasCookie ? { cookie: auth.cookie } : {}),
    } as SourceDefinition;
  });
}

export function sourceToIngestionUrl(source: SourceDefinition): string {
  if (source.type === 'custom') {
    throw new Error(`Custom source "${source.provider}" must be resolved before ingestion.`);
  }
  if (source.type === 'github') {
    const base = `https://github.com/${source.repo}`;
    return source.ref ? `${base}/tree/${source.ref}` : base;
  }
  return source.url;
}

export function sourceHeaders(source: SourceDefinition): Record<string, string> {
  if (source.type === 'github' || source.type === 'custom') return {};
  const headers = { ...(source.headers || {}) };
  if (source.cookie) headers.Cookie = source.cookie;
  return headers;
}

export function sourceLabel(source: SourceDefinition): string {
  if (source.label) return source.label;
  if (source.type === 'github') return source.repo;
  if (source.type === 'custom') return `${source.provider}:${source.value}`;
  return sourceLabelFromUrl(source.url);
}

export function summarizeDefinition(definition: ServerDefinition): SourceSummary {
  const primary = definition.sources[0];
  return {
    count: definition.sources.length,
    labels: definition.sources.map(sourceLabel),
    primary,
  };
}

export function sourceListLabel(definition: ServerDefinition, max = 2): string {
  const labels = definition.sources.map(sourceLabel);
  if (labels.length <= max) return labels.join(', ');
  return `${labels.slice(0, max).join(', ')} +${labels.length - max}`;
}

export function normalizeGitHubRepo(value: string): string {
  const fromUrl = githubRepoFromUrl(value);
  return fromUrl || value.replace(/^github:/i, '').replace(/^\/+/, '').replace(/\.git$/, '');
}

function githubRepoFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1].replace(/\.git$/, '')}`;
  } catch {
    return null;
  }
}

function sourceLabelFromUrl(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/$/, '');
    const leaf = path.split('/').filter(Boolean).pop();
    return leaf ? `${url.hostname}/${leaf}` : url.hostname;
  } catch {
    return value;
  }
}
