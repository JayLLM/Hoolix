---
sidebar_label: Core
sidebar_position: 2
---

# Core API Reference

Core modules provide paths, config, registry validation, errors, logging, and version/update helpers. Business behavior lives in `src/app/services`.

## Errors

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

Use custom errors in library code so CLI, TUI, and GUI can present actionable messages.

## Paths

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

Paths use `env-paths` and can be overridden with `MCP_PORTAL_DATA_DIR`.

## Registry

```ts
export async function listServers(): Promise<ServerMetadata[]>;
export async function getServerMetadata(slug: string): Promise<ServerMetadata>;
export async function registerServer(meta: RegisterInput): Promise<ServerMetadata>;
export async function updateServerMetadata(slug: string, updates: Partial<ServerMetadata>): Promise<ServerMetadata>;
export async function deleteServer(slug: string, opts?: { removeData?: boolean }): Promise<void>;
export function slugify(name: string): string;
export async function validateServerState(slug: string): Promise<{ valid: boolean; issues: string[] }>;
```

Registry metadata supports legacy `sourceUrl` fields and optional modern `definition` fields.

## App Services

Shared services are the preferred integration point:

- `src/app/services/servers.ts`
- `src/app/services/catalog.ts`
- `src/app/services/analytics.ts`
- `src/app/events.ts`
- `src/app/contracts.ts`

Commands, TUI, and GUI should call services rather than duplicating business logic.

## Config

Config is Zod-validated and stores user preferences such as `preferredEmbedding`.

## Version And Update

```ts
export const VERSION: string;
export async function checkForUpdate(): Promise<UpdateCheckResult>;
export async function performUpdate(): Promise<boolean>;
```

Updates apply to compiled installs.

## See Also

- [Registry and Validation](../configuration/registry-and-validation)
- [Architecture Overview](../architecture/overview)
- [CLI Reference](./cli)
