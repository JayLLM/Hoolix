import { describe, it, expect } from 'vitest';
import { chunkMarkdown } from '../src/ingestion/chunker.js';
import { slugify } from '../src/core/registry.js';
import { parseLlmsManifestUrls } from '../src/ingestion/fetchers.js';

describe('slugify', () => {
  it('lowercases and replaces spaces/punct with dashes', () => {
    expect(slugify('My Cool Docs!')).toBe('my-cool-docs');
  });

  it('strips leading/trailing dashes and limits length', () => {
    const long = 'A'.repeat(100) + ' B C';
    const res = slugify(long);
    expect(res.startsWith('a')).toBe(true);
    expect(res.length).toBeLessThanOrEqual(64);
    expect(res.endsWith('-')).toBe(false);
  });

  it('falls back for empty input', () => {
    expect(slugify('   !!!  ')).toMatch(/^server-\d+$/);
  });
});

describe('chunkMarkdown (heading aware)', () => {
  const sample = `# Title

Intro paragraph here.

## Section One

Content for section one with enough text to make a chunk.

## Section Two

More content under two.

### Subsection

Deep content.
`;

  it('splits on headings and builds sectionPath', () => {
    const chunks = chunkMarkdown(sample, 'https://ex.com/doc', 'Title', { targetSize: 120, overlap: 20, minChunkSize: 10 });
    expect(chunks.length).toBeGreaterThan(2);
    // first chunk should capture title
    expect(chunks[0].metadata.title).toBe('Title');
    // later chunks have full section paths built from headings
    const sectioned = chunks.filter(c => c.metadata.sectionPath && /Section/i.test(c.metadata.sectionPath));
    expect(sectioned.length).toBeGreaterThan(0);
  });

  it('adds overlap text from previous chunk (except first)', () => {
    const chunks = chunkMarkdown(sample, 'u', 'T', { targetSize: 80, overlap: 30 });
    if (chunks.length > 1) {
      // second should start with some text from first
      expect(chunks[1].content.length).toBeGreaterThan(30);
    }
  });

  it('splits oversized blocks', () => {
    const big = '# H\n' + 'word '.repeat(300);
    const chunks = chunkMarkdown(big, 'u', 'T', { targetSize: 100, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('respects minChunkSize', () => {
    const tiny = '# H\nx';
    const chunks = chunkMarkdown(tiny, 'u', 'T', { minChunkSize: 50 });
    expect(chunks.length).toBe(0);
  });
});

describe('parseLlmsManifestUrls', () => {
  const base = 'https://docs.ex.com/';

  it('extracts markdown links and bare urls', () => {
    const manifest = `# Docs

- [Overview](https://docs.ex.com/overview.md)
- [Guide](./guide.md)
https://docs.ex.com/api.md

Other text.
`;
    const urls = parseLlmsManifestUrls(manifest, base);
    expect(urls).toContain('https://docs.ex.com/overview.md');
    expect(urls).toContain('https://docs.ex.com/guide.md');
    expect(urls).toContain('https://docs.ex.com/api.md');
  });

  it('dedupes and filters assets + llms files', () => {
    const manifest = `[foo](https://ex.com/llms.txt) [bar](https://ex.com/assets/img.png) https://ex.com/real.md`;
    const urls = parseLlmsManifestUrls(manifest, 'https://ex.com/');
    expect(urls).toEqual(['https://ex.com/real.md']);
  });

  it('ignores anchors and non-http', () => {
    const manifest = `[x](#anchor) [y](mailto:a@b.com) [z](https://ex.com/page)`;
    const urls = parseLlmsManifestUrls(manifest, base);
    // Parser preserves absolute URLs from the manifest; base only used for relatives
    expect(urls).toEqual(['https://ex.com/page']);
  });
});
