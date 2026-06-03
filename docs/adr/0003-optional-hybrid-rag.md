# ADR-0003: Optional Hybrid RAG

**Date**: 2026-06-04  
**Status**: Accepted

## Context
hoolix must provide useful default retrieval after installation while still supporting stronger relevance for larger or more ambiguous documentation sets. Always-on embedding models or vector databases would increase startup, binary, and migration complexity.

## Decision
Keep Fuse.js plus scored keyword matching as the default hot path. Enable BGE semantic embeddings only behind `--hybrid`, `--embedding-model`, or config preference, with lazy dynamic import, persisted vectors, query caching, and RRF/weighted fusion. Add golden-set eval examples so quality can be measured beyond proxy term overlap.

## Consequences
Positive: zero-heavy-dep default behavior, source-grounded results, and an opt-in path for better recall. Negative: first hybrid run downloads a model and eval quality depends on user-maintained goldens. Mitigation: document hybrid costs and keep `examples/golden-eval.ts` small enough for users to adapt.

## References
`src/rag/store.ts`, `src/rag/models.ts`, `examples/golden-eval.ts`, `examples/golden-set.json`.
