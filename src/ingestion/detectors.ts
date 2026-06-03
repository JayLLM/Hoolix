import type { SourceType } from './types.js';
import { isGitHubRepoUrl } from './github.js';

export function detectSourceType(url: string, content?: string): SourceType {
  const lower = url.toLowerCase();

  if (lower.includes('llms.txt') || lower.includes('llms-full.txt')) {
    return 'llms.txt';
  }

  if (isGitHubRepoUrl(url) || lower.includes('github.com')) {
    return 'github';
  }

  // Heuristic: if content looks like markdown with many headings
  if (content && /^#{1,6}\s/m.test(content) && content.length > 1500) {
    return 'generic';
  }

  return 'generic';
}

export { isGitHubRepoUrl } from './github.js';

export function isLikelyMarkdown(contentType: string, content: string): boolean {
  if (contentType.includes('markdown') || contentType.includes('text/plain')) return true;
  // crude but effective
  const mdSignals = ['# ', '## ', '```', '- ', '* '];
  const score = mdSignals.reduce((acc, sig) => acc + (content.includes(sig) ? 1 : 0), 0);
  return score >= 2 && content.length > 300;
}
