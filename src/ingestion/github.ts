import { logger } from '../core/logger.js';
import type { FetchResult } from './fetchers.js';
import {
  fetchTextWithFallback as defaultFetchTextWithFallback,
  fetchWithRetry as defaultFetchWithRetry,
} from './fetchers.js';

interface GitHubFetchers {
  fetchTextWithFallback: typeof defaultFetchTextWithFallback;
  fetchWithRetry: typeof defaultFetchWithRetry;
}

let githubFetchers: GitHubFetchers = {
  fetchTextWithFallback: defaultFetchTextWithFallback,
  fetchWithRetry: defaultFetchWithRetry,
};

export function setGitHubFetchersForTests(fetchers: Partial<GitHubFetchers> | null): void {
  githubFetchers = {
    fetchTextWithFallback: fetchers?.fetchTextWithFallback || defaultFetchTextWithFallback,
    fetchWithRetry: fetchers?.fetchWithRetry || defaultFetchWithRetry,
  };
}

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  ref: string;
  subpath?: string;
  originalUrl: string;
}

export function getGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
}

export function isGitHubRepoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'github.com' || u.hostname === 'www.github.com';
  } catch {
    return false;
  }
}

/**
 * Parse GitHub repo URL into owner/repo/ref/subpath.
 * Handles /tree/REF , /blob/ , trailing .git, subdirs.
 * Defaults ref to 'HEAD' (GitHub resolves to default branch).
 */
export function parseGitHubRepoUrl(url: string): GitHubRepoInfo | null {
  try {
    const u = new URL(url.replace(/\.git$/, ''));
    if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;

    const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];
    let ref = 'HEAD';
    let subpath: string | undefined;

    // /owner/repo/tree/REF[/sub]
    // /owner/repo[/sub]
    if (parts[2] === 'tree' || parts[2] === 'blob') {
      ref = parts[3] || 'HEAD';
      if (parts.length > 4) subpath = parts.slice(4).join('/');
    } else if (parts.length > 2) {
      subpath = parts.slice(2).join('/');
    }

    return { owner, repo, ref, subpath, originalUrl: url };
  } catch {
    return null;
  }
}

function rawBase(info: GitHubRepoInfo): string {
  return `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${info.ref}`;
}

function blobBase(info: GitHubRepoInfo): string {
  const ref = info.ref === 'HEAD' ? 'main' : info.ref; // best-effort for human urls
  return `https://github.com/${info.owner}/${info.repo}/blob/${ref}`;
}

function apiBase(info: GitHubRepoInfo): string {
  return `https://api.github.com/repos/${info.owner}/${info.repo}`;
}

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': 'hoolix/0.2 (https://github.com/JayLLM/hoolix)',
    Accept: 'application/vnd.github+json',
  };
  if (token) h['Authorization'] = `token ${token}`;
  return h;
}

/** Try common llms + README locations (raw) for a GitHub repo. Returns first usable.
 * Now supports private repos by passing Authorization header when token is provided.
 */
export async function fetchPrimaryGitHubContent(
  info: GitHubRepoInfo,
  opts: { token?: string; timeout?: number } = {}
): Promise<FetchResult | null> {
  const token = opts.token || getGitHubToken();
  const candidates: string[] = [];

  const base = rawBase(info);
  const sub = info.subpath ? `/${info.subpath.replace(/^\//, '')}` : '';

  // llms priority (full then txt) at root + /docs + subpath
  candidates.push(
    `${base}${sub}/llms-full.txt`,
    `${base}${sub}/llms.txt`,
    `${base}/llms-full.txt`,
    `${base}/llms.txt`,
    `${base}/docs/llms-full.txt`,
    `${base}/docs/llms.txt`,
    `${base}/README.md`,
    `${base}/docs/README.md`,
    `${base}/doc/README.md`,
    `${base}/README`,
  );

  const headers: Record<string, string> = { Accept: 'text/plain' };
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  for (const cand of candidates) {
    try {
      const { text, contentType } = await githubFetchers.fetchTextWithFallback(cand, {
        timeout: opts.timeout || 15000,
        headers,
      });
      if (text && text.length > 200) {
        // Return a "blob" style url for grounding (human friendly) when possible
        const blobUrl = cand.replace(rawBase(info), blobBase(info)).replace(/\/raw\/[^/]+\//, `/blob/${info.ref}/`);
        return {
          content: text,
          contentType: contentType || 'text/markdown',
          url: blobUrl,
        };
      }
    } catch (err: any) {
      // For private repos, 401/403 usually means missing/invalid token or no access.
      // 404 is common while probing optional llms/README candidates, so keep it quiet.
      if (token && (err?.message?.includes('401') || err?.message?.includes('403'))) {
        logger.warn(`GitHub raw fetch failed for private repo candidate ${cand}. Check GITHUB_TOKEN has 'repo' scope (classic) or appropriate fine-grained permissions.`);
      } else if (!token && (err?.message?.includes('401') || err?.message?.includes('403') || err?.message?.includes('404'))) {
        // Common for private repo without token; only warn once-ish via debug to avoid spam, user sees via higher level
        logger.debug(`GitHub candidate ${cand} failed (likely private; set GITHUB_TOKEN for access).`);
      }
    }
  }
  return null;
}

/** Crude .gitignore aware filter + hardcoded ignores. */
function shouldIgnore(path: string, gitignoreText?: string): boolean {
  const p = path.toLowerCase();
  const hard = [
    'node_modules/', '.git/', 'dist/', 'build/', 'out/', '.next/', 'target/', 'vendor/',
    'coverage/', 'tmp/', 'temp/', '.cache/', '__pycache__/', '.venv/', 'site-packages/',
    '.DS_Store', '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.zip', '.tar', '.gz', '.7z',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.mp4', '.mov',
  ];
  if (hard.some(h => p.includes(h))) return true;

  if (!gitignoreText) return false;
  const lines = gitignoreText.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  for (const line of lines) {
    const pat = line.replace(/^\//, '').replace(/\*/g, '.*');
    try {
      if (new RegExp(pat, 'i').test(path)) return true;
    } catch {}
  }
  return false;
}

/**
 * Discover candidate doc files for a GitHub repo.
 * - If token: use /git/trees?recursive=1 (rich, respects .gitignore if present).
 * - Else: return a small set of likely README + docs/ .md + llms candidates (no API call).
 * Returns list of {rawUrl, blobUrl, path} sorted with llms/README first.
 */
export async function discoverGitHubDocFiles(
  info: GitHubRepoInfo,
  opts: { token?: string; maxPages?: number; onProgress?: (c: number, t: number) => void } = {}
): Promise<Array<{ rawUrl: string; blobUrl: string; path: string }>> {
  const token = opts.token || getGitHubToken();
  const max = opts.maxPages || 80;
  const results: Array<{ rawUrl: string; blobUrl: string; path: string }> = [];

  const rBase = rawBase(info);
  const bBase = blobBase(info);
  const sub = info.subpath ? `/${info.subpath.replace(/^\//, '')}` : '';

  if (token) {
    try {
      const treeUrl = `${apiBase(info)}/git/trees/${encodeURIComponent(info.ref)}?recursive=1`;
      const res = await githubFetchers.fetchWithRetry(treeUrl, { headers: authHeaders(token), timeout: 15000 });
      if (res.status === 403 || res.status === 429) {
        const rem = res.headers.get('x-ratelimit-remaining');
        logger.warn(
          `GitHub API rate limited (remaining=${rem ?? '?'}) — falling back to limited discovery (~12 files). ` +
          `Set GITHUB_TOKEN for 5,000 req/hr vs 60 req/hr unauthenticated: export GITHUB_TOKEN=<token>`
        );
        // fall through to limited direct
      } else if (res.ok) {
        const data: any = await res.json();
        let gitignoreText: string | undefined;
        const tree: any[] = data.tree || [];

        // fetch .gitignore if present (best effort) — pass token for private repos
        const gi = tree.find((e: any) => e.path === '.gitignore' && e.type === 'blob');
        if (gi) {
          try {
            const giRaw = `${rBase}/.gitignore`;
            const giHeaders: Record<string, string> = { Accept: 'text/plain' };
            if (token) giHeaders['Authorization'] = `token ${token}`;
            const { text } = await githubFetchers.fetchTextWithFallback(giRaw, { timeout: 8000, headers: giHeaders });
            gitignoreText = text;
          } catch {}
        }

        const candidates = tree
          .filter((e: any) => e.type === 'blob' && /\.(md|mdx|txt|rst)$/i.test(e.path))
          .map((e: any) => e.path)
          .filter((p: string) => {
            if (sub && !p.startsWith(sub.replace(/^\//, ''))) return false;
            return !shouldIgnore(p, gitignoreText);
          })
          .sort((a: string, b: string) => {
            // prioritize llms + readme + docs/
            const score = (p: string) => {
              const l = p.toLowerCase();
              if (l.includes('llms-full')) return 0;
              if (l.endsWith('llms.txt')) return 1;
              if (l.includes('readme')) return 2;
              if (l.startsWith('docs/') || l.startsWith('doc/')) return 3;
              return 10;
            };
            return score(a) - score(b) || a.localeCompare(b);
          })
          .slice(0, max);

        for (const p of candidates) {
          const rawUrl = `${rBase}/${p}`;
          const blobUrl = `${bBase}/${p}`;
          results.push({ rawUrl, blobUrl, path: p });
        }
        return results;
      }
    } catch (e: any) {
      logger.debug(`GitHub tree discovery failed, using limited candidates: ${e?.message || e}`);
    }
  }

  // Limited direct candidates (no or failed token; always works for public)
  const limited = [
    `${sub}/llms-full.txt`, `${sub}/llms.txt`,
    'llms-full.txt', 'llms.txt',
    'README.md', 'docs/README.md', 'doc/README.md',
    'docs/index.md', 'README',
  ].map(p => p.replace(/^\//, ''));

  for (const p of limited) {
    if (results.length >= 12) break;
    if (sub && !p.startsWith(sub.replace(/^\//, '')) && !p.startsWith('llms')) continue;
    results.push({
      rawUrl: `${rBase}/${p}`,
      blobUrl: `${bBase}/${p}`,
      path: p,
    });
  }
  return results.slice(0, max);
}

/**
 * High-level: given a github URL, return primary (best llms/README) + additional pages for multi-file ingest.
 * Reuses existing fetch* helpers + parse for manifests.
 * Always falls back safely.
 */
export async function fetchGitHubRepoDocumentation(
  url: string,
  opts: {
    discoverLlms?: boolean;
    maxPages?: number;
    onProgress?: (completed: number, total: number) => void;
    token?: string;
  } = {}
): Promise<{ primary: FetchResult; pages?: FetchResult[] } | null> {
  const info = parseGitHubRepoUrl(url);
  if (!info) return null;

  const token = opts.token || getGitHubToken();
  const maxPages = opts.maxPages || 80;

  if (!token) {
    logger.warn(
      'No GITHUB_TOKEN set — using limited file discovery (~12 files max). ' +
      'For full repo indexing set: export GITHUB_TOKEN=<token>  (needs "repo" scope or "Contents: Read" fine-grained permission).'
    );
  }

  // Primary (llms or README)
  let primary = await fetchPrimaryGitHubContent(info, { token });
  if (!primary) {
    // fallback to raw README at least (pass auth for private repos)
    try {
      const fallback = `${rawBase(info)}/README.md`;
      const headers: Record<string, string> = { Accept: 'text/plain' };
      if (token) headers['Authorization'] = `token ${token}`;
      const { text } = await githubFetchers.fetchTextWithFallback(fallback, { timeout: 12000, headers });
      if (text) primary = { content: text, contentType: 'text/markdown', url: `${blobBase(info)}/README.md` };
    } catch (e: any) {
      if (!token && (e?.message?.includes('401') || e?.message?.includes('403') || e?.message?.includes('404'))) {
        logger.warn('GitHub raw fetch failed. For private repos set GITHUB_TOKEN (with repo scope) and re-run.');
      }
    }
  }
  if (!primary) return null;

  // Additional pages (for non-manifest github docs)
  let pages: FetchResult[] = [];
  if (opts.discoverLlms !== false) {
    const discovered = await discoverGitHubDocFiles(info, {
      token,
      maxPages,
      onProgress: opts.onProgress,
    });

    // Skip the primary if it was one of them
    const toFetch = discovered.filter(d => d.rawUrl !== primary!.url && d.blobUrl !== primary!.url);

    if (toFetch.length > 0) {
      // Reuse concurrent fetch (but map to raw for content, keep blob for metadata.url)
      // Thread Authorization for private repo raw fetches when GITHUB_TOKEN present (fixes full private support)
      const pageHeaders: Record<string, string> = { Accept: 'text/plain' };
      if (token) pageHeaders['Authorization'] = `token ${token}`;
      const fetchResults = await Promise.all(
        toFetch.slice(0, maxPages - 1).map(async (d) => {
          try {
            const { text } = await githubFetchers.fetchTextWithFallback(d.rawUrl, { timeout: 15000, headers: pageHeaders });
            if (text && text.length > 80) {
              return { content: text, contentType: 'text/markdown', url: d.blobUrl } as FetchResult;
            }
          } catch (e: any) {
            if (!token && (e?.message?.includes('401') || e?.message?.includes('403'))) {
              logger.debug(`Private GitHub page fetch likely requires GITHUB_TOKEN: ${d.path}`);
            }
          }
          return null;
        })
      );
      pages = fetchResults.filter(Boolean) as FetchResult[];
    }

    // If primary was llms manifest, let normal pipeline expand it (parseLlmsManifestUrls will resolve relatives correctly against blob/raw urls)
  }

  return { primary, pages: pages.length ? pages : undefined };
}
