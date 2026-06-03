import type { IngestedChunk } from './types.js';

export interface ChunkOptions {
  targetSize?: number;   // preferred chars per chunk
  overlap?: number;
  minChunkSize?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetSize: 1100,
  overlap: 180,
  minChunkSize: 120,
};

/**
 * Heading-aware chunker.
 * Splits on # headings, maintains sectionPath/headings stack for RAG grounding,
 * adds overlap, caps oversized blocks, and enriches chunks with url + title.
 */
export function chunkMarkdown(
  markdown: string,
  sourceUrl: string,
  baseTitle: string,
  opts: ChunkOptions = {}
): IngestedChunk[] {
  const { targetSize, overlap, minChunkSize } = { ...DEFAULTS, ...opts };

  const lines = markdown.split(/\r?\n/);
  const chunks: IngestedChunk[] = [];

  let currentSection: string[] = [];
  let currentHeadings: string[] = [];
  let currentTitle = baseTitle;
  let order = 0;

  const flush = (extraContext = '') => {
    let text = currentSection.join('\n').trim();
    if (extraContext) text = extraContext + '\n' + text;
    if (text.length < minChunkSize) return;

    // Oversized: split further
    if (text.length > targetSize * 1.6) {
      const subChunks = splitLargeBlock(text, targetSize, overlap);
      for (const sub of subChunks) {
        chunks.push(createChunk(sub, sourceUrl, currentTitle, currentHeadings, order++));
      }
    } else {
      chunks.push(createChunk(text, sourceUrl, currentTitle, currentHeadings, order++));
    }
    currentSection = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();

      // Flush prior section on heading boundary
      if (currentSection.length > 0) {
        flush();
      }

      // Trim stack to current level + push
      currentHeadings = currentHeadings.slice(0, level - 1);
      currentHeadings.push(headingText);

      if (level === 1) {
        currentTitle = headingText;
      }

      currentSection.push(line);
      continue;
    }

    currentSection.push(line);

    // Size-based flush (within a section)
    const currentText = currentSection.join('\n');
    if (currentText.length >= targetSize) {
      flush();
    }
  }

  // Final flush for trailing content
  if (currentSection.length > 0) {
    flush();
  }

  // Prepend tail of previous chunk as overlap context (for better retrieval)
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1].content;
    const overlapText = prev.slice(-overlap);
    if (overlapText.trim().length > 40) {
      chunks[i].content = overlapText + '\n\n' + chunks[i].content;
      chunks[i].metadata.charCount = chunks[i].content.length;
    }
  }

  return chunks;
}

function createChunk(
  content: string,
  url: string,
  title: string,
  headings: string[],
  order: number
): IngestedChunk {
  const sectionPath = headings.length > 0 ? headings.join(' > ') : undefined;
  return {
    id: `chunk_${order}_${Date.now().toString(36)}`,
    content: content.trim(),
    metadata: {
      url,
      title,
      sectionPath,
      headings: [...headings],
      charCount: content.length,
      order,
    },
  };
}

function splitLargeBlock(text: string, target: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + target, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start < 0) start = 0;
    if (end === text.length) break;
  }
  return chunks;
}
