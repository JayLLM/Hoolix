import { logger } from '../core/logger.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fetchPrimaryGitHubContent, parseGitHubRepoUrl, getGitHubToken, isGitHubRepoUrl } from './github.js';

export interface FetchResult {
  content: string;
  contentType: string;
  url: string;
}

const DEFAULT_TIMEOUT = 25_000;
const MAX_RETRIES = 2;
const execFileAsync = promisify(execFile);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('Request timeout')), ms + 100)
    ),
  ]) as Promise<T>;
}

export async function fetchWithRetry(
  url: string,
  opts: { timeout?: number; headers?: Record<string, string> } = {}
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, headers = {} } = opts;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await withTimeout(
        fetch(url, {
          headers: {
            'User-Agent': 'hoolix/0.2 (https://github.com/JayLLM/hoolix)',
            Accept: '*/*',
            ...headers,
          },
          redirect: 'follow',
        }),
        timeout
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err: any) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const delay = 400 * (attempt + 1);
        logger.debug(`Fetch retry ${attempt + 1} for ${url} after ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr || new Error('Fetch failed');
}

async function fetchTextWithCurl(
  url: string,
  opts: { timeout?: number; headers?: Record<string, string> } = {}
): Promise<string | null> {
  const { timeout = DEFAULT_TIMEOUT, headers = {} } = opts;
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const args: string[] = [
    '-fsSL',
    '--compressed',
    '--max-time',
    String(Math.ceil(timeout / 1000)),
    '-A',
    headers['User-Agent'] || headers['user-agent'] || 'hoolix/0.2 (https://github.com/JayLLM/hoolix)',
  ];
  // Forward all provided headers (critical for Authorization on private GitHub raw.githubusercontent when curl fallback triggers)
  for (const [k, v] of Object.entries(headers)) {
    if (!k || !v) continue;
    const key = k.toLowerCase() === 'user-agent' ? 'User-Agent' : k;
    if (key.toLowerCase() === 'accept') {
      args.push('-H', `Accept: ${v}`);
    } else {
      args.push('-H', `${key}: ${v}`);
    }
  }
  if (!Object.keys(headers).some((k) => k.toLowerCase() === 'accept')) {
    args.push('-H', `Accept: ${headers.Accept || headers.accept || '*/*'}`);
  }
  args.push(url);

  try {
    const { stdout } = await execFileAsync(curl, args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.length > 0 ? stdout : null;
  } catch (err: any) {
    logger.debug(`curl fallback failed for ${url}: ${err?.message || err}`);
    return null;
  }
}

export async function fetchTextWithFallback(
  url: string,
  opts: { timeout?: number; headers?: Record<string, string> } = {}
): Promise<{ text: string; contentType: string }> {
  try {
    const res = await fetchWithRetry(url, opts);
    return {
      text: await res.text(),
      contentType: res.headers.get('content-type') || '',
    };
  } catch (err) {
    const text = await fetchTextWithCurl(url, opts);
    if (text) {
      logger.debug(`Fetched ${url} with curl fallback`);
      return { text, contentType: 'text/plain; charset=utf-8' };
    }
    throw err;
  }
}

/**
 * Smart fetch that prefers llms.txt when possible.
 * When given (or discovering) llms.txt, we first try the sibling llms-full.txt
 * because full concatenated content is ideal for high-quality RAG.
 */
export async function fetchDocumentation(
  url: string,
  opts: { discoverLlms?: boolean; headers?: Record<string, string> } = {}
): Promise<FetchResult> {
  const { discoverLlms = true, headers = {} } = opts;
  const normalized = url.trim();

  // GitHub special-case (early, non-breaking): prefer llms/README discovery + raw fetches.
  // Falls back to normal path on any failure (rate, private w/o token, etc.).
  if (isGitHubRepoUrl(normalized) && discoverLlms) {
    try {
      const ghInfo = parseGitHubRepoUrl(normalized);
      if (ghInfo) {
        const ghPrimary = await fetchPrimaryGitHubContent(ghInfo, { token: getGitHubToken() });
        if (ghPrimary) {
          logger.debug(`GitHub primary content fetched for ${normalized}`);
          return ghPrimary;
        }
      }
    } catch (e: any) {
      logger.debug(`GitHub primary attempt failed for ${normalized}, falling back: ${e?.message || e}`);
    }
  }

  // Direct llms: try full sibling first for best RAG content.
  if (normalized.endsWith('llms.txt') || normalized.endsWith('llms-full.txt')) {
    if (normalized.endsWith('llms.txt')) {
      const full = await tryFetchLlmsFull(normalized, headers);
      if (full) return full;
    }
    const { text } = await fetchTextWithFallback(normalized, {
      headers: { Accept: 'text/plain', ...headers },
    });
    return {
      content: text,
      contentType: 'text/markdown',
      url: normalized,
    };
  }

  // Discovery only for primary call (discoverLlms=true). Sub-pages from manifests use discoverLlms:false
  // to avoid wrong metadata.url and duplicate root content.
  if (discoverLlms) {
    try {
      const u = new URL(normalized);
      const llmsCandidates = [
        `${u.origin}/llms-full.txt`,
        `${u.origin}/llms.txt`,
        `${u.origin}/docs/llms-full.txt`,
        `${u.origin}/docs/llms.txt`,
      ];
      // UA rotation + explicit Accept for sites that 404 node-fetch but serve to curl/browser (e.g. docs.x.ai).
      const discoveryUAs = [
        'hoolix/0.2 (https://github.com/JayLLM/hoolix)',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'curl/8.4.0',
      ];
      for (const cand of llmsCandidates) {
        let foundText: string | null = null;
        for (const ua of discoveryUAs) {
          try {
            const fetched = await fetchTextWithFallback(cand, {
              timeout: 12000,
              headers: { 'User-Agent': ua, 'Accept': 'text/plain', ...headers },
            });
            if (fetched.text.length > 200) {
              foundText = fetched.text;
              break;
            }
          } catch {
            // try next UA
          }
        }
        if (foundText) {
          // llms.txt hit: still attempt full sibling first.
          if (cand.endsWith('llms.txt')) {
            const full = await tryFetchLlmsFull(cand, headers);
            if (full) return full;
          }
          logger.info(`Found llms at ${cand}`);
          return { content: foundText, contentType: 'text/markdown', url: cand };
        }
      }
    } catch {
      // invalid for discovery; fall through to direct fetch
    }
  }

  // Generic or manifest sub-page content (no llms discovery).
  const res = await fetchWithRetry(normalized, { headers });
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  return {
    content: text,
    contentType,
    url: normalized,
  };
}

/** Try sibling/peer llms-full.txt for a given llms.txt (returns null if none usable). */
export async function tryFetchLlmsFull(llmsTxtUrl: string, headers: Record<string, string> = {}): Promise<FetchResult | null> {
  try {
    const u = new URL(llmsTxtUrl);
    const candidates: string[] = [
      llmsTxtUrl.replace(/llms\.txt$/i, 'llms-full.txt'),
      `${u.origin}/llms-full.txt`,
      `${u.origin}/docs/llms-full.txt`,
    ];
    for (const cand of candidates) {
      if (cand === llmsTxtUrl) continue;
      try {
        const { text } = await fetchTextWithFallback(cand, { timeout: 15000, headers });
        if (text.length > 1500) {
          logger.info(`Found llms-full.txt at ${cand}`);
          return { content: text, contentType: 'text/markdown', url: cand };
        }
      } catch {
        // ignore; try next candidate
      }
    }
  } catch {
    // invalid url; no full available
  }
  return null;
}

/**
 * Parse an llms.txt (manifest) content for documentation page URLs.
 * Handles common formats: markdown links [Title](url) and bare http(s) lines.
 * Returns absolute deduped URLs (excluding the llms files themselves).
 */
export function parseLlmsManifestUrls(content: string, baseUrl: string): string[] {
  const urls = new Set<string>();

  // markdown links [text](url)
  const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(content)) !== null) {
    let raw = m[1].trim();
    // strip trailing punctuation leaked from markdown lists
    raw = raw.replace(/[),.]+$/, '');
    if (!raw || raw.startsWith('#') || raw.startsWith('data:') || raw.startsWith('mailto:')) continue;
    try {
      const abs = new URL(raw, baseUrl).href;
      if (abs.startsWith('http') && !/\.(png|jpe?g|gif|svg|ico|css|js|woff|ttf|map|json|zip|tar|pdf)$/i.test(abs)) {
        urls.add(abs);
      }
    } catch {}
  }

  // bare https?:// lines (or after links)
  const bareRe = /https?:\/\/\S+/g;
  while ((m = bareRe.exec(content)) !== null) {
    let raw = m[0];
    raw = raw.replace(/[),.]+$/, '');
    try {
      const abs = new URL(raw, baseUrl).href;
      if (abs.startsWith('http') && !/\.(png|jpe?g|gif|svg|ico|css|js|woff|ttf|map|json|zip|tar|pdf)$/i.test(abs)) {
        urls.add(abs);
      }
    } catch {}
  }

  return Array.from(urls).filter(
    (u) => !/llms(-full)?\.txt$/i.test(u) && !u.includes('/assets/') && !u.includes('/images/')
  );
}

/**
 * Concurrent fetch for manifest pages. Passes discoverLlms:false so subpages keep their own URL in metadata.
 */
export async function fetchPagesConcurrently(
  urls: string[],
  concurrency = 4,
  onProgress?: (completed: number, total: number) => void,
  headers: Record<string, string> = {},
): Promise<FetchResult[]> {
  const results: FetchResult[] = [];
  const queue = [...urls];
  let completed = 0;
  const total = urls.length;

  const runWorker = async (): Promise<void> => {
    while (queue.length > 0) {
      const url = queue.shift()!;
      try {
        const r = await fetchDocumentation(url, { discoverLlms: false, headers });
        results.push(r);
      } catch (err: any) {
        logger.debug(`Sub-page fetch failed for ${url}: ${err?.message || err}`);
      }
      completed += 1;
      onProgress?.(completed, total);
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, 8)) }, () => runWorker());
  await Promise.all(workers);
  return results;
}
