---
sidebar_label: Ingestion
sidebar_position: 3
---

# Ingestion API Reference

The ingestion layer is used through app services by the CLI, TUI, and GUI. Public shapes are validated and persisted through server and source definitions.

## SourceDefinition

Defined in the app/source model and validated with Zod.

```ts
export type SourceKind = 'docs' | 'llms' | 'web' | 'github' | 'custom';

export interface SourceDefinition {
  id: string;
  type: SourceKind;
  value: string;
  label?: string;
  auth?: {
    headers?: Record<string, string>;
    cookies?: string[];
  };
}
```

CLI examples:

```bash
--source docs:https://react.dev/llms.txt
--source github:vercel/next.js
--source custom:handbook:getting-started
```

## ServerDefinition

```ts
export interface ServerDefinition {
  version: number;
  name: string;
  sources: SourceDefinition[];
  template?: {
    id: string;
    name: string;
  };
  schedule?: {
    interval: 'hourly' | 'daily' | 'off';
    nextRunAt?: string;
  };
}
```

Legacy servers with only `sourceUrl` are migrated into a one-source definition when loaded.

## IngestedChunk

```ts
export interface IngestedChunk {
  id: string;
  content: string;
  metadata: {
    url: string;
    title: string;
    sectionPath?: string;
    headings?: string[];
    charCount: number;
    order: number;
    sourceId?: string;
    sourceType?: string;
    sourceLabel?: string;
  };
}
```

`metadata.url` is critical. MCP tools use it for grounding and clients should show it when citing answers.

## IngestionResult

```ts
export interface IngestionResult {
  sourceUrl: string;
  sourceType: SourceType;
  title: string;
  chunks: IngestedChunk[];
  stats: {
    totalChunks: number;
    totalChars: number;
    pagesProcessed: number;
    durationMs: number;
  };
  rawMarkdown?: string;
}
```

## Progress

```ts
export interface IngestionProgress {
  stage: string;
  message: string;
  current?: number;
  total?: number;
}

export type ProgressCallback = (progress: IngestionProgress) => void;
```

Progress events are shared across CLI spinners, TUI actions, GUI flows, and service calls.

## Main Pipeline

```ts
export async function ingestDocumentation(
  url: string,
  options?: IngestionOptions
): Promise<IngestionResult>;
```

The multi-source service layer calls the pipeline once per resolved source, annotates provenance, combines chunks, and builds the index.

## Fetching

Fetchers support:

- `llms-full.txt` sibling discovery.
- Manifest expansion.
- GitHub raw and tree discovery.
- Request headers and cookies.
- User-agent rotation and retries.
- Curl fallback.

## See Also

- [Architecture: Ingestion Pipeline](../architecture/ingestion-pipeline)
- [Creating Servers](../guides/creating-servers)
- [CLI Reference](./cli)
