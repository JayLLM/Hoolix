---
sidebar_label: Core
sidebar_position: 2
---

# Core API Reference

## Errors (`src/core/errors.ts`)

```ts
export class MCPPError extends Error {
  code: string;
  details?: Record<string, unknown>;
}
export class ValidationError extends MCPPError {}
export class IngestionError extends MCPPError {}
export class ServerNotFoundError extends MCPPError {}
export class ServerAlreadyExistsError extends MCPPError {}
export class ProcessError extends MCPPError {}

export function isMCPPError(err: unknown): err is MCPPError;
```

All library code uses these instead of raw `Error` or strings.

## Paths (`src/core/paths.ts`)

```ts
export interface AppPaths {
  data: string;
  config: string;
  servers: string;
  cache: string;
}

export function getPaths(): AppPaths;
export async function ensureDirectories(): Promise<AppPaths>;
export function getServerDir(slug: string): string;
export function getServerMetadataPath(slug: string): string;
export function getServerDataDir(slug: string): string;
export function getServerRuntimePath(slug: string): string;
```

Backed by `env-paths` (OS-correct user data locations). Never hard-code `~/.hoolix`.

## Registry (`src/core/registry.ts`)

```ts
export const ServerMetadataSchema = z.object({ ... });
export type ServerMetadata = z.infer<...>;

export async function listServers(): Promise<ServerMetadata[]>;
export async function getServerMetadata(slug: string): Promise<ServerMetadata>;
export async function registerServer(meta: Omit<...>): Promise<ServerMetadata>;
export async function updateServerMetadata(slug, updates): Promise<ServerMetadata>;
export async function deleteServer(slug, { removeData } = {}): Promise<void>;
export function slugify(name: string): string;

export async function getOnDiskChunkCount(slug: string): Promise<number | null>;
export async function validateServerState(slug: string): Promise<{ valid: boolean; issues: string[] }>;
```

`validateServerState` is the key helper used by `list`, `info`, and `verify`. It compares on-disk `chunks.json` length vs registry `chunkCount` without loading the full RAG.

## Version & Updater

```ts
export const VERSION = "0.0.0";        // synced from package.json on release; baked at compile

export async function checkForUpdate(): Promise<UpdateCheckResult>;
export async function performUpdate(): Promise<boolean>;  // only for compiled binaries
```

## Config (rarely used at present)

`loadConfig`, `saveConfig`, `updateConfig` with Zod schema. Currently mainly holds `preferredEmbedding` placeholder.

## See Also

- [Registry and Validation](../configuration/registry-and-validation)
- [Errors used in CLI flows](../getting-started/basic-usage)
- Full Zod shapes in source
