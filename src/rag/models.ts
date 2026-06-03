/**
 * Central registry for embedding models (DRY source of truth).
 * - 'fuse': pure keyword/fuzzy (no ML)
 * - 'hybrid-*': BGE bi-encoder via @huggingface/transformers (lazy) + cosine + Fuse blend/RRF
 *
 * Adding a new model: just extend the registry + the zod enums in core/config + core/registry
 * (they import SUPPORTED_EMBEDDING_MODELS).
 *
 * All hybrid models follow BGE convention: queries get instruction prefix, passages do not.
 * Model downloads cached by HF transformers.js (~first use only).
 */
export type EmbeddingModel = 'fuse' | 'hybrid-bge-small' | 'hybrid-bge-base';

export interface EmbeddingConfig {
  /** HF model id (Xenova/ for onnx-converted that works in transformers.js) */
  model: string;
  dim: number;
  queryPrefix: string;
  passagePrefix: string;
  normalize: boolean;
}

export const EMBEDDING_REGISTRY: Record<EmbeddingModel, EmbeddingConfig | null> = {
  fuse: null,
  'hybrid-bge-small': {
    model: 'Xenova/bge-small-en-v1.5',
    dim: 384,
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
    passagePrefix: '',
    normalize: true,
  },
  'hybrid-bge-base': {
    model: 'Xenova/bge-base-en-v1.5',
    dim: 768,
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
    passagePrefix: '',
    normalize: true,
  },
} as const;

export const SUPPORTED_EMBEDDING_MODELS = Object.keys(EMBEDDING_REGISTRY) as EmbeddingModel[];

export function getEmbeddingConfig(model: EmbeddingModel): EmbeddingConfig | null {
  return EMBEDDING_REGISTRY[model] ?? null;
}

export function isHybridModel(model: EmbeddingModel | string): boolean {
  return typeof model === 'string' && model.startsWith('hybrid-');
}

/**
 * Recommended defaults for hybrid search tuning.
 */
export const DEFAULT_HYBRID_ALPHA = 0.7; // semantic weight in weighted blend (0..1)
export const DEFAULT_RRF_K = 60;
