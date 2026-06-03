import TurndownService from 'turndown';
// @ts-ignore - turndown-plugin-gfm has poor ESM types
import * as turndownPluginGfm from 'turndown-plugin-gfm';

// Lazy runtime require for jsdom (and transitive css-tree which has data/patch.json).
// This keeps the common llms.txt/markdown path free of heavy modules at bundle time
// (prevents "Cannot find module '../data/patch.json'" in compiled binaries and shrinks size).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndown) {
    turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    // GitHub Flavored Markdown (tables, strikethrough, task lists)
    turndown.use(turndownPluginGfm.gfm);
  }
  return turndown;
}

/**
 * Convert HTML to Markdown (Readability + Turndown). Called only for HTML sourceType.
 * See top-of-file for lazy loading rationale.
 */
export function htmlToMarkdown(html: string, baseUrl?: string): string {
  try {
    const { JSDOM } = require('jsdom');
    const { Readability } = require('@mozilla/readability');
    const dom = new JSDOM(html, { url: baseUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article && article.content) {
      const md = getTurndown().turndown(article.content);
      return cleanMarkdown(md);
    }
  } catch (e) {
    // fall through to raw turndown
  }

  // Fallback: convert whatever we have
  try {
    return cleanMarkdown(getTurndown().turndown(html));
  } catch {
    return '';
  }
}

function cleanMarkdown(md: string): string {
  return md
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/**
 * Normalization pass (dedup newlines, trim) for markdown/llms content.
 */
export function normalizeMarkdown(md: string): string {
  return cleanMarkdown(md);
}
