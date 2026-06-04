import { SUPPORTED_EMBEDDING_MODELS, isHybridModel } from '../rag/models.js';
import type { EmbeddingModel } from '../rag/models.js';
import type { Config } from '../core/config.js';

/**
 * Resolves the embedding model from CLI args and config.
 * Priority: --embedding-model > --hybrid > config.preferredEmbedding > 'fuse'
 */
export function resolveEmbeddingModel(args: string[], cfg: Config): EmbeddingModel {
  const emIdx = args.indexOf('--embedding-model');
  if (emIdx !== -1 && args[emIdx + 1]) {
    const cand = args[emIdx + 1] as EmbeddingModel;
    if ((SUPPORTED_EMBEDDING_MODELS as string[]).includes(cand)) return cand;
  }
  if (args.includes('--hybrid')) return 'hybrid-bge-small';
  if ((SUPPORTED_EMBEDDING_MODELS as string[]).includes(cfg.preferredEmbedding)) {
    return cfg.preferredEmbedding as EmbeddingModel;
  }
  return 'fuse';
}

export { isHybridModel };
