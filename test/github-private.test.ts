import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { discoverGitHubDocFiles, fetchGitHubRepoDocumentation, parseGitHubRepoUrl, setGitHubFetchersForTests } from '../src/ingestion/github.js';
import type { FetchResult } from '../src/ingestion/fetchers.js';

interface TextCall {
  url: string;
  options: { headers?: Record<string, string>; timeout?: number };
}

interface RetryCall {
  url: string;
  options: { headers?: Record<string, string>; timeout?: number };
}

function makeResponse(tree: Array<{ path: string; type: string }>): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ tree }),
  } as Response;
}

describe('private GitHub ingestion paths', () => {
  let textCalls: TextCall[] = [];
  let retryCalls: RetryCall[] = [];

  beforeEach(() => {
    textCalls = [];
    retryCalls = [];
    process.env.GITHUB_TOKEN = 'ghp_private_token';
  });

  afterEach(() => {
    setGitHubFetchersForTests(null);
    delete process.env.GITHUB_TOKEN;
  });

  it('uses authenticated GitHub tree discovery and filters ignored private repo files', async () => {
    const info = parseGitHubRepoUrl('https://github.com/acme/private-docs/tree/main/docs');
    expect(info).not.toBeNull();

    setGitHubFetchersForTests({
      fetchWithRetry: async (url, options) => {
        retryCalls.push({ url, options: options as RetryCall['options'] });
        return makeResponse([
          { path: '.gitignore', type: 'blob' },
          { path: 'docs/README.md', type: 'blob' },
          { path: 'docs/private.mdx', type: 'blob' },
          { path: 'node_modules/pkg/README.md', type: 'blob' },
          { path: 'src/index.ts', type: 'blob' },
        ]);
      },
      fetchTextWithFallback: async (url, options) => {
        textCalls.push({ url, options: options as TextCall['options'] });
        return { text: 'node_modules/\n', contentType: 'text/plain' };
      },
    });

    const files = await discoverGitHubDocFiles(info!, { maxPages: 10 });

    expect(retryCalls[0].url).toBe('https://api.github.com/repos/acme/private-docs/git/trees/main?recursive=1');
    expect(retryCalls[0].options.headers?.Authorization).toBe('token ghp_private_token');
    expect(textCalls[0].url).toBe('https://raw.githubusercontent.com/acme/private-docs/main/.gitignore');
    expect(textCalls[0].options.headers?.Authorization).toBe('token ghp_private_token');
    expect(files.map((file) => file.path)).toEqual(['docs/README.md', 'docs/private.mdx']);
  });

  it('passes the token to primary and additional raw fetches for private repos', async () => {
    setGitHubFetchersForTests({
      fetchWithRetry: async (url, options) => {
        retryCalls.push({ url, options: options as RetryCall['options'] });
        return makeResponse([
          { path: 'README.md', type: 'blob' },
          { path: 'docs/guide.md', type: 'blob' },
        ]);
      },
      fetchTextWithFallback: async (url, options) => {
        textCalls.push({ url, options: options as TextCall['options'] });
        if (url.endsWith('/llms-full.txt') || url.endsWith('/llms.txt')) {
          throw new Error('404');
        }
        if (url.endsWith('/README.md')) {
          return { text: '# Private README\n\n' + 'primary docs '.repeat(30), contentType: 'text/markdown' } as FetchResult;
        }
        if (url.endsWith('/docs/guide.md')) {
          return { text: '# Private Guide\n\n' + 'additional docs '.repeat(20), contentType: 'text/markdown' } as FetchResult;
        }
        return { text: '', contentType: 'text/plain' } as FetchResult;
      },
    });

    const result = await fetchGitHubRepoDocumentation('https://github.com/acme/private-docs', { maxPages: 5 });

    expect(result).not.toBeNull();
    expect(result?.primary.url).toBe('https://github.com/acme/private-docs/blob/main/README.md');
    expect(result?.pages?.[0]?.url).toBe('https://github.com/acme/private-docs/blob/main/docs/guide.md');
    expect(textCalls.some((call) => call.options.headers?.Authorization === 'token ghp_private_token')).toBe(true);
    expect(retryCalls[0].options.headers?.Authorization).toBe('token ghp_private_token');
  });
});
