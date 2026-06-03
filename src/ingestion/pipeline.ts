import { logger } from '../core/logger.js';
import type { IngestionOptions, IngestionResult, ProgressCallback, IngestedChunk } from './types.js';
import {
  fetchDocumentation,
  parseLlmsManifestUrls,
  fetchPagesConcurrently,
} from './fetchers.js';
import { detectSourceType, isLikelyMarkdown, isGitHubRepoUrl } from './detectors.js';
import { htmlToMarkdown, normalizeMarkdown } from './cleaners.js';
import { chunkMarkdown } from './chunker.js';
import { fetchGitHubRepoDocumentation, getGitHubToken } from './github.js';

export async function ingestDocumentation(
  url: string,
  options: IngestionOptions = {}
): Promise<IngestionResult> {
  const start = Date.now();
  const {
    onProgress,
    maxChunks = 8000,
    chunkSize = 1100,
    chunkOverlap = 180,
    maxPages = 80,
  } = options;

  const emit: ProgressCallback = (p) => onProgress?.(p);

  emit({ stage: 'detect', message: 'Detecting source type...' });

  // Primary fetch (prefers llms-full.txt sibling when input is llms.txt)
  emit({ stage: 'fetch', message: `Fetching ${url}...` });
  let fetched = await fetchDocumentation(url);

  emit({ stage: 'fetch', message: `Fetched ${fetched.content.length.toLocaleString()} chars` });

  const sourceType = detectSourceType(fetched.url, fetched.content);

  // pagesToProcess starts with primary; may expand for manifests below.
  let pagesToProcess: Array<{ content: string; contentType: string; url: string }> = [fetched];
  let pagesProcessed = 1;

  // Manifest expansion (only for llms.txt that is not -full and contains links/URLs)
  const isLlmsManifest =
    fetched.url.includes('llms.txt') &&
    !fetched.url.includes('llms-full.txt') &&
    (fetched.content.includes('[') || /^- /m.test(fetched.content) || /https?:\/\//.test(fetched.content));

  if (isLlmsManifest) {
    emit({ stage: 'manifest', message: 'Parsing llms.txt manifest for page links...' });
    const manifestUrls = parseLlmsManifestUrls(fetched.content, fetched.url);
    const toFetch = manifestUrls.slice(0, Math.max(0, maxPages - 1));

    if (toFetch.length > 0) {
      emit({
        stage: 'pages',
        message: `Fetching ${toFetch.length} pages from manifest (concurrency 3-4)...`,
        current: 0,
        total: toFetch.length,
      });

      const morePages = await fetchPagesConcurrently(toFetch, 3, (completed, total) => {
        emit({
          stage: 'pages',
          message: `Fetching pages (${completed}/${total})...`,
          current: completed,
          total,
        });
      });

      if (morePages.length > 0) {
        pagesToProcess = [fetched, ...morePages];
        pagesProcessed = pagesToProcess.length;
        emit({
          stage: 'pages',
          message: `Fetched ${morePages.length} additional pages`,
          current: pagesProcessed,
          total: pagesProcessed,
        });
      }
    }
  }

  // GitHub expansion (when not already handled by llms manifest and source looks like github repo)
  // Uses dedicated discovery (tree if token, limited candidates otherwise) so we get multiple .md/README/llms files
  // with correct per-file metadata.url (blob form for grounding).
  const isGh = sourceType === 'github' || isGitHubRepoUrl(fetched.url);
  if (isGh && !isLlmsManifest && pagesToProcess.length === 1) {
    try {
      emit({ stage: 'manifest', message: 'Discovering GitHub documentation files (README, docs/, llms)...' });
      const ghToken = getGitHubToken();
      const ghRes = await fetchGitHubRepoDocumentation(fetched.url, {
        discoverLlms: true,
        maxPages: maxPages || 80,
        onProgress: (c, t) => emit({ stage: 'pages', message: `GitHub files (${c}/${t})...`, current: c, total: t }),
        token: ghToken,
      });
      if (ghRes && ghRes.pages && ghRes.pages.length > 0) {
        pagesToProcess = [ghRes.primary, ...ghRes.pages];
        pagesProcessed = pagesToProcess.length;
        emit({ stage: 'pages', message: `Fetched ${ghRes.pages.length} additional GitHub files`, current: pagesProcessed, total: pagesProcessed });
      }
    } catch (e: any) {
      logger.debug(`GitHub multi-file expansion failed, using primary only: ${e?.message || e}`);
      // keep the single primary; normal flow continues
    }
  }

  // Per-page clean+chunk so metadata.url is the real page (not root manifest) for grounding.
  emit({ stage: 'clean', message: `Converting ${pagesToProcess.length} page(s) to Markdown...` });

  let chunks: IngestedChunk[] = [];
  for (const page of pagesToProcess) {
    let markdown: string;
    if (page.contentType.includes('html') && !isLikelyMarkdown(page.contentType, page.content)) {
      markdown = htmlToMarkdown(page.content, page.url);
    } else {
      markdown = normalizeMarkdown(page.content);
    }

    if (!markdown || markdown.length < 100) continue;

    const pageTitle = extractTitle(markdown, page.url);
    const pageChunks = chunkMarkdown(markdown, page.url, pageTitle, {
      targetSize: chunkSize,
      overlap: chunkOverlap,
    });

    chunks.push(...pageChunks);

    if (chunks.length > maxChunks) {
      logger.warn(`Truncating from ${chunks.length} to ${maxChunks} chunks`);
      chunks = chunks.slice(0, maxChunks);
      break;
    }
  }

  if (chunks.length === 0) {
    throw new Error('Could not extract meaningful content from the provided URL(s).');
  }

  const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);

  emit({
    stage: 'chunk',
    message: 'Chunking documentation...',
  });

  const isLlmsFull = fetched.url.includes('llms-full.txt');
  const pagesInfo = isLlmsFull
    ? 'llms-full.txt (concatenated documentation)'
    : `${pagesProcessed} page(s)`;

  emit({
    stage: 'done',
    message: `Ingestion complete: ${chunks.length} chunks, ${totalChars.toLocaleString()} chars from ${pagesInfo}`,
  });

  const baseTitle = extractTitle(
    pagesToProcess[0]?.content || '',
    pagesToProcess[0]?.url || url,
  );

  const result: IngestionResult = {
    sourceUrl: fetched.url,
    sourceType,
    title: baseTitle,
    chunks,
    stats: {
      totalChunks: chunks.length,
      totalChars,
      pagesProcessed,
      durationMs: Date.now() - start,
    },
    rawMarkdown: (pagesToProcess[0]?.content || '').slice(0, 50_000),
  };

  return result;
}

function extractTitle(md: string, fallbackUrl: string): string {
  const h1 = md.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();

  try {
    const u = new URL(fallbackUrl);
    return u.hostname + u.pathname;
  } catch {
    return 'Documentation';
  }
}
