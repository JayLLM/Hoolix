import { getServerDataDir } from '../core/paths.js';
import { logger } from '../core/logger.js';
import type { IngestedChunk } from '../ingestion/types.js';
import type {
  SearchResult,
  ReadPageResult,
  TableOfContentsItem,
  RAGSearchOptions,
  EmbeddingModel,
} from './types.js';
import {
  getEmbeddingConfig,
  isHybridModel,
  DEFAULT_HYBRID_ALPHA,
  DEFAULT_RRF_K,
} from './models.js';
import Fuse from 'fuse.js';
import fs from 'fs-extra';
import path from 'node:path';

/**
 * Pure-JS cosine similarity (no deps). Used for hybrid semantic scores.
 * Returns value in [-1, 1]; higher is better.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 1e-8 ? dot / denom : 0;
}

/**
 * Reciprocal Rank Fusion (RRF) — lightweight, model-free reranker for hybrid search.
 * Combines two ranked lists (e.g. keyword + semantic) using rank positions.
 * Often outperforms simple score blending for relevance.
 */
export function reciprocalRankFusion(
  listA: Array<{ id: string }>,
  listB: Array<{ id: string }>,
  k: number = DEFAULT_RRF_K
): Map<string, number> {
  const scores = new Map<string, number>();
  const addList = (lst: Array<{ id: string }>) => {
    lst.forEach((item, idx) => {
      const rank = idx + 1;
      const prev = scores.get(item.id) || 0;
      scores.set(item.id, prev + 1 / (k + rank));
    });
  };
  addList(listA);
  addList(listB);
  return scores;
}

const CHUNKS_FILE = 'chunks.json';
const EMBEDDINGS_FILE = 'embeddings.json';

/**
 * RAG store (advanced hybrid v2).
 *
 * - Fuse.js (keyword/fuzzy + direct contains) always available, zero-dep, fast.
 * - Optional hybrid per-server: lazy @huggingface/transformers BGE (small or base) + pure cosine.
 *   Vectors persisted to embeddings.json (persistent embedding cache).
 * - Smart runtime query-embedding LRU cache (in-mem) for repeated queries in long-lived hosts.
 * - Improved hybrid: configurable alpha blend OR RRF reranker for better relevance.
 * - Embed cache hit detection on reindex (stable chunk ids + count match => skip re-embed).
 * - All results include source URLs + sectionPath (grounding contract).
 *
 * Design: lightweight (no LanceDB in hot path), DRY (model registry in models.ts), graceful fallback,
 * measurable (via verify --eval + benchmark).
 *
 * See AGENTS.md, docs on advanced-rag, and models.ts for extending models.
 */

interface StoredChunk extends IngestedChunk {}

export class DocumentationRAG {
  private chunks: StoredChunk[] = [];
  private fuse: Fuse<StoredChunk> | null = null;
  private embeddings: Record<string, number[]> = {}; // id -> vector (persistent cache for hybrid)
  private embedPipeline: any = null; // lazy transformers pipeline
  private activeConfig: ReturnType<typeof getEmbeddingConfig> = null;

  // In-memory LRU cache for *query* embeddings (reused across searches in same host process).
  // Keyed by normalized query. Evicts oldest on overflow. Huge win for agent loops repeating queries.
  private queryEmbedCache = new Map<string, number[]>();
  private readonly QUERY_CACHE_MAX = 128;

  private readonly slug: string;
  private readonly dataDir: string;
  private chunksFile: string;
  private embeddingsFile: string;
  private embeddingModel: EmbeddingModel = 'fuse';

  constructor(slug: string, embeddingModel: EmbeddingModel = 'fuse') {
    this.slug = slug;
    this.dataDir = getServerDataDir(slug);
    this.chunksFile = path.join(this.dataDir, CHUNKS_FILE);
    this.embeddingsFile = path.join(this.dataDir, EMBEDDINGS_FILE);
    this.embeddingModel = embeddingModel;
    this.activeConfig = getEmbeddingConfig(embeddingModel);
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.dataDir);

    if (await fs.pathExists(this.chunksFile)) {
      this.chunks = await fs.readJson(this.chunksFile);
      this.buildFuseIndex();
      await this.loadEmbeddingsIfPresent();
      logger.debug(`Loaded ${this.chunks.length} chunks for RAG (${this.slug}, model=${this.embeddingModel})`);
    }
  }

  private async loadEmbeddingsIfPresent(): Promise<void> {
    if (await fs.pathExists(this.embeddingsFile)) {
      try {
        this.embeddings = await fs.readJson(this.embeddingsFile);
      } catch {
        this.embeddings = {};
      }
    }
  }

  /** Clear query embed cache (e.g. after big changes, or for testing) */
  clearQueryCache(): void {
    this.queryEmbedCache.clear();
  }

  private buildFuseIndex() {
    if (this.chunks.length === 0) {
      this.fuse = null;
      return;
    }

    this.fuse = new Fuse(this.chunks, {
      keys: [
        { name: 'content', weight: 0.6 },
        { name: 'metadata.title', weight: 0.25 },
        { name: 'metadata.sectionPath', weight: 0.15 },
      ],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 2,
    });
  }

  /**
   * indexChunks: persist + build Fuse (and optional embeddings for hybrid).
   * options.embeddingModel controls whether to compute/persist BGE vectors (lazy download on first hybrid use).
   * Called from create/reindex; onProgress used for 'embed' stage reporting.
   *
   * Smart caching for embeddings (persistent on disk) + forceReembed opt.
   */
  async indexChunks(
    chunks: IngestedChunk[],
    options: {
      embeddingModel?: EmbeddingModel;
      onProgress?: (p: { stage: string; message: string; current?: number; total?: number }) => void;
      forceReembed?: boolean;
    } = {}
  ): Promise<number> {
    await fs.ensureDir(this.dataDir);
    this.chunks = chunks as StoredChunk[];
    await fs.writeJson(this.chunksFile, this.chunks, { spaces: 2 });
    this.buildFuseIndex();

    const model = options.embeddingModel || this.embeddingModel || 'fuse';
    this.embeddingModel = model;
    this.activeConfig = getEmbeddingConfig(model);

    if (isHybridModel(model) && chunks.length > 0) {
      const prog = options.onProgress;

      // Persistent embed cache hit? (reuses vectors when chunk ids + count match after re-ingest of same content)
      await this.loadEmbeddingsIfPresent();
      const haveAllVectors =
        Object.keys(this.embeddings).length >= this.chunks.length &&
        this.chunks.every((c) => Array.isArray(this.embeddings[c.id]) && this.embeddings[c.id].length > 0);

      if (haveAllVectors && !options.forceReembed) {
        prog?.({
          stage: 'embed',
          message: `Embed cache hit (${Object.keys(this.embeddings).length}/${this.chunks.length} vectors) — skipping`,
        });
        logger.debug(`Embed cache hit for ${this.slug} (${model})`);
      } else {
        const cfg = this.activeConfig!;
        try {
          const modelLabel = model.replace('hybrid-', '').toUpperCase();
          prog?.({
            stage: 'embed',
            message: `Preparing ${modelLabel} embeddings (lazy; may download ~first run)...`,
          });

          const embedder = await this.getEmbedder((info: any) => {
            if (info?.status === 'progress' || info?.progress != null) {
              const pct = info.progress != null ? ` (${Math.round(info.progress)}%)` : '';
              prog?.({ stage: 'embed', message: `${modelLabel} download/embed${pct}...` });
            }
          });

          // Batch passages (no prefix per model guidance)
          const batchSize = 32;
          const newEmbs: Record<string, number[]> = {};
          const pfx = cfg?.passagePrefix || '';

          for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const texts = batch.map((c) => pfx + c.content);
            const output = await embedder(texts, { pooling: 'mean', normalize: cfg?.normalize ?? true });

            // Robust vec extraction (supports different output shapes from transformers.js)
            let vecs: number[][] = [];
            if (output.tolist) {
              vecs = output.tolist();
            } else if (output.data) {
              const flat = Array.from(output.data as any).map((x: any) => Number(x));
              const d = cfg?.dim ?? 384;
              for (let b = 0; b < batch.length; b++) vecs.push(flat.slice(b * d, (b + 1) * d) as number[]);
            }

            batch.forEach((c, j) => {
              const v = vecs[j];
              if (Array.isArray(v) && v.length > 0) newEmbs[c.id] = v.map((n: any) => Number(n));
            });

            prog?.({
              stage: 'embed',
              message: `Embedded chunks (${Math.min(i + batchSize, chunks.length)}/${chunks.length})`,
              current: Math.min(i + batchSize, chunks.length),
              total: chunks.length,
            });
          }

          this.embeddings = newEmbs;
          await fs.writeJson(this.embeddingsFile, this.embeddings, { spaces: 2 });
          logger.success(`Indexed ${Object.keys(this.embeddings).length} hybrid embeddings for ${this.slug} (${model})`);
          prog?.({ stage: 'embed', message: `Hybrid embeddings ready (${Object.keys(this.embeddings).length} vectors)` });
        } catch (e: any) {
          logger.warn(`Hybrid embedding failed for ${this.slug} (falling back to fuse-only): ${e?.message || e}`);
          this.embeddings = {};
          // Non-fatal: keyword/Fuse path still works perfectly
        }
      }
    } else {
      // Ensure clean for non-hybrid
      this.embeddings = {};
    }

    logger.success(`Indexed ${chunks.length} chunks for RAG store (${this.slug}, model=${model})`);
    return chunks.length;
  }

  private async getEmbedder(progressCallback?: (info: any) => void): Promise<any> {
    if (this.embedPipeline) return this.embedPipeline;

    const cfg = this.activeConfig;
    if (!cfg) throw new Error(`No embedding config for model ${this.embeddingModel}`);

    // Dynamic import: heavy transformers (onnx runtime etc) only on hybrid path. Matches AGENTS.md + binary size discipline.
    const mod = await import('@huggingface/transformers');
    this.embedPipeline = await mod.pipeline('feature-extraction', cfg.model, {
      progress_callback: progressCallback,
    });
    logger.debug(`${this.embeddingModel} embedder initialized for ${this.slug}`);
    return this.embedPipeline;
  }

  async search(query: string, opts: RAGSearchOptions = {}): Promise<SearchResult[]> {
    await this.initialize();
    const limit = Math.max(1, Math.min(opts.limit ?? 8, 20));
    const mode = opts.mode || 'hybrid';
    const alpha = opts.alpha ?? (mode === 'semantic' ? 1.0 : DEFAULT_HYBRID_ALPHA);
    const useRrf = opts.reranker === 'rrf' || (opts.reranker !== false && mode === 'hybrid');
    const rrfK = opts.rrfK ?? DEFAULT_RRF_K;
    const qLower = query.toLowerCase();

    if (this.chunks.length === 0) return [];

    // === Keyword path (always computed; used for kw mode, hybrid fusion, and fallback) ===
    const words = qLower.split(/\s+/).filter((w) => w.length > 2);
    const directMatches = this.chunks.filter((c) => {
      const text = (c.content + ' ' + c.metadata.title + ' ' + (c.metadata.sectionPath || '')).toLowerCase();
      return words.some((w) => text.includes(w));
    });

    let kwRanked: Array<{ id: string; item: StoredChunk; score: number }> = [];
    if (directMatches.length > 0) {
      kwRanked = directMatches.map((c) => ({ id: c.id, item: c, score: 0.95 }));
    } else if (this.fuse) {
      const fuseRes = this.fuse.search(query, { limit: Math.min(limit * 5, 100) });
      kwRanked = fuseRes.map((fr) => ({
        id: fr.item.id,
        item: fr.item,
        score: Math.max(0.3, 1 - Math.min(1, fr.score ?? 0.5)),
      }));
    } else {
      kwRanked = this.chunks.slice(0, limit * 3).map((c) => ({ id: c.id, item: c, score: 0.6 }));
    }

    // Optional pre-filter
    if (opts.filterUrl) {
      const f = opts.filterUrl.toLowerCase();
      kwRanked = kwRanked.filter((r) => r.item.metadata.url.toLowerCase().includes(f));
    }

    // === Semantic / hybrid path ===
    const hasVectors = Object.keys(this.embeddings).length > 0 && (mode === 'semantic' || mode === 'hybrid');
    if (hasVectors) {
      try {
        const cfg = this.activeConfig;
        if (!cfg) throw new Error('Hybrid config missing');

        // Query embed (with prefix) — use LRU cache for SMART repeated-query perf
        const cacheKey = query.trim().toLowerCase().slice(0, 256);
        let qVec: number[] | undefined = this.queryEmbedCache.get(cacheKey);

        if (!qVec) {
          const embedder = await this.getEmbedder();
          const qText = (cfg.queryPrefix || '') + query;
          const qOut = await embedder(qText, { pooling: 'mean', normalize: cfg.normalize });
          qVec = Array.from(qOut.data || qOut.tolist?.()[0] || []).map((n: any) => Number(n));
          this.queryEmbedCache.set(cacheKey, qVec);
          if (this.queryEmbedCache.size > this.QUERY_CACHE_MAX) {
            const oldest = this.queryEmbedCache.keys().next().value;
            if (oldest) this.queryEmbedCache.delete(oldest);
          }
        }

        // Compute semantic scores for chunks that have vectors (brute-force is fine <= ~8k)
        const semRanked: Array<{ id: string; item: StoredChunk; score: number }> = [];
        for (const c of this.chunks) {
          const v = this.embeddings[c.id];
          if (v && qVec && v.length === qVec.length) {
            semRanked.push({ id: c.id, item: c, score: cosineSimilarity(qVec, v) });
          }
        }
        semRanked.sort((a, b) => b.score - a.score);

        // Build final list using RRF (preferred for hybrid relevance) or weighted blend
        let blended: Array<{ c: StoredChunk; score: number }> = [];

        if (useRrf && mode === 'hybrid') {
          const kwForRrf = kwRanked.slice(0, 40);
          const semForRrf = semRanked.slice(0, 40);
          const rrfScores = reciprocalRankFusion(kwForRrf, semForRrf, rrfK);

          const candidates = new Map<string, StoredChunk>();
          for (const r of [...kwForRrf, ...semForRrf]) candidates.set(r.id, r.item);

          blended = Array.from(candidates.entries())
            .map(([id, c]) => ({ c, score: rrfScores.get(id) || 0 }))
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.min(limit * 2, 50));
        } else {
          // Weighted blend (backward compat + pure semantic)
          const semMap = new Map(semRanked.map((r) => [r.id, r.score]));
          const kwMap = new Map(kwRanked.map((r) => [r.id, r.score]));

          blended = this.chunks
            .filter((c) => semMap.has(c.id) || kwMap.has(c.id))
            .map((c) => {
              const sem = semMap.get(c.id) ?? 0;
              const kw = kwMap.get(c.id) ?? 0.35;
              const blendedScore = alpha * sem + (1 - alpha) * kw;
              return { c, score: blendedScore };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.min(limit * 2, 50));
        }

        // Map to results (normalize score to nice 0.1-0.99 range for UX)
        return blended.slice(0, limit).map(({ c, score }) => ({
          content: c.content,
          score: Math.max(0.1, Math.min(0.99, score)),
          metadata: c.metadata,
          citationId: c.metadata.url,
        }));
      } catch (e: any) {
        logger.warn(`Semantic/hybrid search failed for ${this.slug}, falling back to keyword: ${e?.message || e}`);
        // fallthrough
      }
    }

    // === Pure keyword / fallback path ===
    const finalKw = kwRanked.slice(0, limit);
    return finalKw.map((r) => ({
      content: r.item.content,
      score: Math.max(0.1, Math.min(0.99, r.score)),
      metadata: r.item.metadata,
      citationId: r.item.metadata.url,
    }));
  }

  async readPage(urlOrPath: string, maxChunks = 15): Promise<ReadPageResult | null> {
    await this.initialize();
    const lower = urlOrPath.toLowerCase();

    const matching = this.chunks
      .filter(c => c.metadata.url.toLowerCase().includes(lower) || 
                   (c.metadata.sectionPath?.toLowerCase().includes(lower) ?? false))
      .slice(0, maxChunks);

    if (matching.length === 0) return null;

    const firstMeta = matching[0].metadata;

    return {
      url: firstMeta.url,
      title: firstMeta.title,
      content: matching.map(c => c.content).join('\n\n---\n\n'),
      chunks: matching.map(c => ({
        content: c.content,
        sectionPath: c.metadata.sectionPath,
      })),
    };
  }

  async getTableOfContents(): Promise<TableOfContentsItem[]> {
    await this.initialize();

    const toc = new Map<string, TableOfContentsItem>();

    for (const chunk of this.chunks) {
      if (chunk.metadata.sectionPath) {
        const parts = chunk.metadata.sectionPath.split(' > ');
        parts.forEach((part, idx) => {
          const key = parts.slice(0, idx + 1).join(' > ');
          if (!toc.has(key)) {
            toc.set(key, {
              title: part,
              level: idx + 1,
              url: chunk.metadata.url,
              sectionPath: key,
            });
          }
        });
      }
    }

    return Array.from(toc.values()).sort((a, b) => a.sectionPath!.localeCompare(b.sectionPath!));
  }

  async close() {
    // no-op (file-backed)
  }
}

export async function createRAGForServer(slug: string, embeddingModel: EmbeddingModel = 'fuse'): Promise<DocumentationRAG> {
  const rag = new DocumentationRAG(slug, embeddingModel);
  await rag.initialize();
  return rag;
}
