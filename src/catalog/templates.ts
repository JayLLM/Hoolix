import { z } from 'zod';
import { SourceDefinitionSchema, type ServerDefinition, type SourceDefinition } from '../sources/types.js';

// ── Kind ──────────────────────────────────────────────────────────────────────

export const TemplateKindSchema = z.enum(['docs-rag', 'mcp-server']);
export type TemplateKind = z.infer<typeof TemplateKindSchema>;

// ── Inputs (non-sensitive; stored in definition.template.inputs) ──────────────

export const TemplateInputSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
});
export type TemplateInput = z.infer<typeof TemplateInputSchema>;

// ── Credentials (sensitive; stored in credentials.json, 0600) ─────────────────

export const CredentialInputSchema = z.object({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Must be a valid identifier'),
  label: z.string().min(1),
  description: z.string().min(1),
  envVar: z.string().optional(),     // auto-detect from process.env at create time
  required: z.boolean().default(true),
  sensitive: z.boolean().default(true),
  placeholder: z.string().optional(),
  validationHint: z.string().optional(),
  docsUrl: z.string().url().optional(),
});
export type CredentialInput = z.infer<typeof CredentialInputSchema>;

// ── Server run config (mcp-server kind only; credentials interpolated at connect) ──

export const ServerRunConfigSchema = z.object({
  transport: z.enum(['stdio', 'http']).default('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  npmPackage: z.string().optional(),
  minNodeVersion: z.string().optional(),
  proxyable: z.boolean().default(true),
});
export type ServerRunConfig = z.infer<typeof ServerRunConfigSchema>;

// ── Template ──────────────────────────────────────────────────────────────────

export const CatalogTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().min(1),
  version: z.string().min(1),
  kind: TemplateKindSchema.default('docs-rag'),
  category: z.enum([
    'docs', 'github', 'tools', 'data', 'productivity', 'ai',
    'official', 'example', 'community',
  ]),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  homepage: z.string().url().optional(),
  // docs-rag kind: non-sensitive inputs (url, repo, etc.) and pre-baked sources
  inputs: z.array(TemplateInputSchema).default([]),
  sources: z.array(SourceDefinitionSchema).default([]),
  // mcp-server kind: sensitive credentials + run config
  credentials: z.array(CredentialInputSchema).default([]),
  server: ServerRunConfigSchema.optional(),
});
export type CatalogTemplate = z.infer<typeof CatalogTemplateSchema>;

// ── Official template definitions (15 total: 4 docs-rag + 11 mcp-server) ────────

const OFFICIAL_TEMPLATES: CatalogTemplate[] = [

  // ── docs-rag kind ───────────────────────────────────────────────────────────

  {
    id: 'docs-rag',
    name: 'Documentation RAG MCP',
    version: '1.0.0',
    kind: 'docs-rag',
    category: 'docs',
    description: 'Turn any documentation URL, llms.txt, or docs page into a grounded Hoolix MCP server.',
    tags: ['docs', 'llms.txt', 'rag'],
    inputs: [
      {
        name: 'url',
        label: 'Documentation URL',
        description: 'A docs page, llms.txt, llms-full.txt, or site URL.',
        required: true,
        placeholder: 'https://example.com/llms.txt',
      },
    ],
    credentials: [],
    sources: [],
  },
  {
    id: 'github-docs',
    name: 'GitHub Repository Docs MCP',
    version: '1.0.0',
    kind: 'docs-rag',
    category: 'github',
    description: 'Index README, docs folders, and llms files from a GitHub repository.',
    tags: ['github', 'repository', 'docs'],
    inputs: [
      {
        name: 'repo',
        label: 'GitHub repository',
        description: 'Repository in owner/name form, or a GitHub URL.',
        required: true,
        placeholder: 'modelcontextprotocol/servers',
      },
    ],
    credentials: [],
    sources: [],
  },
  {
    id: 'terraform-aws-docs',
    name: 'Terraform AWS Docs MCP',
    version: '1.0.0',
    kind: 'docs-rag',
    category: 'official',
    description: 'A starter MCP server for Terraform AWS provider documentation.',
    tags: ['terraform', 'aws', 'infrastructure'],
    inputs: [],
    credentials: [],
    sources: [
      {
        type: 'docs',
        url: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs',
        label: 'Terraform AWS provider docs',
      },
    ],
  },
  {
    id: 'hoolix-docs',
    name: 'Hoolix Docs MCP',
    version: '1.0.0',
    kind: 'docs-rag',
    category: 'example',
    description: 'Example template for indexing the Hoolix README from GitHub.',
    tags: ['hoolix', 'example', 'github'],
    inputs: [],
    credentials: [],
    sources: [
      {
        type: 'github',
        repo: 'JayLLM/hoolix',
        label: 'JayLLM/hoolix',
      },
    ],
  },

  // ── mcp-server kind (tools) ─────────────────────────────────────────────────

  {
    id: 'fetch',
    name: 'Fetch MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'tools',
    description: 'Give AI agents the ability to fetch any URL and convert it to Markdown. Enables web browsing and live document retrieval with no credentials required.',
    tags: ['fetch', 'web', 'browser', 'http', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    inputs: [],
    credentials: [],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-fetch'],
      env: {},
      proxyable: true,
    },
  },
  {
    id: 'filesystem',
    name: 'Filesystem MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'tools',
    description: 'Give AI agents read/write access to local directories via the official MCP filesystem server.',
    tags: ['filesystem', 'files', 'local', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    inputs: [
      {
        name: 'allowedPath',
        label: 'Allowed directory path',
        description: 'Absolute path the AI agent can read and write (e.g. /Users/jay/projects)',
        required: true,
        placeholder: '/Users/jay/projects',
      },
    ],
    credentials: [],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem@latest', '{allowedPath}'],
      env: {},
      npmPackage: '@modelcontextprotocol/server-filesystem',
      proxyable: true,
    },
  },
  {
    id: 'github-api',
    name: 'GitHub API MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'tools',
    description: 'Search issues, pull requests, files, and code across GitHub via the official GitHub MCP server.',
    tags: ['github', 'code', 'issues', 'prs', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    inputs: [],
    credentials: [
      {
        name: 'githubToken',
        label: 'GitHub Personal Access Token',
        description: 'Token with repo and read:org scopes for accessing repositories',
        envVar: 'GITHUB_TOKEN',
        required: true,
        sensitive: true,
        placeholder: 'ghp_...',
        validationHint: 'Scopes: repo, read:org',
        docsUrl: 'https://github.com/settings/tokens',
      },
    ],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github@latest'],
      env: { GITHUB_TOKEN: '{githubToken}' },
      npmPackage: '@modelcontextprotocol/server-github',
      proxyable: true,
    },
  },
  {
    id: 'postgres',
    name: 'PostgreSQL MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'data',
    description: 'Execute read-only SQL queries and inspect schema on PostgreSQL databases via the official MCP server.',
    tags: ['postgres', 'database', 'sql', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    inputs: [],
    credentials: [
      {
        name: 'databaseUrl',
        label: 'PostgreSQL connection URL',
        description: 'Full connection string including user, password, host, and database name',
        envVar: 'DATABASE_URL',
        required: true,
        sensitive: true,
        placeholder: 'postgresql://user:pass@localhost:5432/mydb',
        validationHint: 'Format: postgresql://user:password@host:port/database',
      },
    ],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres@latest', '{databaseUrl}'],
      env: {},
      npmPackage: '@modelcontextprotocol/server-postgres',
      proxyable: true,
    },
  },
  {
    id: 'sqlite',
    name: 'SQLite MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'data',
    description: 'Query and modify local SQLite databases. Requires Python 3.x and uv (https://docs.astral.sh/uv/).',
    tags: ['sqlite', 'database', 'sql', 'local', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
    inputs: [
      {
        name: 'dbPath',
        label: 'Database file path',
        description: 'Absolute path to the .db or .sqlite file',
        required: true,
        placeholder: '/Users/jay/data/mydb.db',
      },
    ],
    credentials: [],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-sqlite', '--db-path', '{dbPath}'],
      env: {},
      proxyable: true,
    },
  },

  // ── mcp-server kind (ai) ────────────────────────────────────────────────────

  {
    id: 'memory',
    name: 'Memory MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'ai',
    description: 'Persistent in-session memory graph for AI agents using a local knowledge graph.',
    tags: ['memory', 'knowledge-graph', 'ai', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    inputs: [],
    credentials: [],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory@latest'],
      env: {},
      npmPackage: '@modelcontextprotocol/server-memory',
      proxyable: true,
    },
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'ai',
    description: 'Structured multi-step reasoning tool that breaks complex problems into sequential thoughts with revision support.',
    tags: ['reasoning', 'thinking', 'ai', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    inputs: [],
    credentials: [],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking@latest'],
      env: {},
      npmPackage: '@modelcontextprotocol/server-sequential-thinking',
      proxyable: true,
    },
  },
  {
    id: 'brave-search',
    name: 'Brave Search MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'tools',
    description: 'Web and local search via the Brave Search API. Requires a free Brave Search API key.',
    tags: ['search', 'web', 'brave', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    inputs: [],
    credentials: [
      {
        name: 'braveApiKey',
        label: 'Brave Search API Key',
        description: 'API key for Brave Search (free tier available)',
        envVar: 'BRAVE_API_KEY',
        required: true,
        sensitive: true,
        placeholder: 'BSA...',
        validationHint: 'Get a free key at https://brave.com/search/api/',
        docsUrl: 'https://brave.com/search/api/',
      },
    ],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search@latest'],
      env: { BRAVE_API_KEY: '{braveApiKey}' },
      npmPackage: '@modelcontextprotocol/server-brave-search',
      proxyable: true,
    },
  },
  {
    id: 'slack',
    name: 'Slack MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'productivity',
    description: 'Read channels, threads, and users from Slack workspaces via the official Slack MCP server.',
    tags: ['slack', 'messaging', 'productivity', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    inputs: [],
    credentials: [
      {
        name: 'slackBotToken',
        label: 'Slack Bot Token',
        description: 'Bot token (xoxb-...) with channels:read, users:read scopes',
        envVar: 'SLACK_BOT_TOKEN',
        required: true,
        sensitive: true,
        placeholder: 'xoxb-...',
        validationHint: 'Scopes: channels:read, channels:history, users:read',
        docsUrl: 'https://api.slack.com/authentication/token-types#bot',
      },
      {
        name: 'slackTeamId',
        label: 'Slack Team ID',
        description: 'Workspace Team ID (e.g. T01234ABCD), found in your Slack admin settings',
        envVar: 'SLACK_TEAM_ID',
        required: true,
        sensitive: false,
        placeholder: 'T01234ABCD',
      },
    ],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack@latest'],
      env: {
        SLACK_BOT_TOKEN: '{slackBotToken}',
        SLACK_TEAM_ID:   '{slackTeamId}',
      },
      npmPackage: '@modelcontextprotocol/server-slack',
      proxyable: true,
    },
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'tools',
    description: 'Browser automation and web scraping via Puppeteer. Allows AI agents to navigate, screenshot, and interact with web pages.',
    tags: ['browser', 'puppeteer', 'automation', 'scraping', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    inputs: [],
    credentials: [],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer@latest'],
      env: {},
      npmPackage: '@modelcontextprotocol/server-puppeteer',
      proxyable: true,
    },
  },
  {
    id: 'google-maps',
    name: 'Google Maps MCP',
    version: '1.0.0',
    kind: 'mcp-server',
    category: 'tools',
    description: 'Geocoding, directions, places search, and map data via the Google Maps Platform API.',
    tags: ['maps', 'geocoding', 'places', 'google', 'official'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps',
    inputs: [],
    credentials: [
      {
        name: 'googleMapsApiKey',
        label: 'Google Maps API Key',
        description: 'API key with Geocoding, Directions, and Places APIs enabled',
        envVar: 'GOOGLE_MAPS_API_KEY',
        required: true,
        sensitive: true,
        placeholder: 'AIza...',
        validationHint: 'Enable: Geocoding API, Directions API, Places API',
        docsUrl: 'https://console.cloud.google.com/apis/credentials',
      },
    ],
    sources: [],
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-google-maps@latest'],
      env: { GOOGLE_MAPS_API_KEY: '{googleMapsApiKey}' },
      npmPackage: '@modelcontextprotocol/server-google-maps',
      proxyable: true,
    },
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

export function getOfficialTemplates(): CatalogTemplate[] {
  return OFFICIAL_TEMPLATES.map((t) => CatalogTemplateSchema.parse(t));
}

/**
 * Returns the kind of a template by ID. Defaults to 'docs-rag' for unknown IDs
 * so existing servers without a template ID continue to work unchanged.
 */
export function getTemplateKind(templateId: string): TemplateKind {
  const found = OFFICIAL_TEMPLATES.find((t) => t.id === templateId);
  return found?.kind ?? 'docs-rag';
}

export function buildDefinitionFromTemplate(
  template: CatalogTemplate,
  inputs: Record<string, string> = {},
): ServerDefinition {
  if (template.kind === 'mcp-server') {
    // mcp-server kind: sources are empty; inputs stored in template reference for interpolation
    return {
      version: 1,
      sources: [],
      template: {
        id: template.id,
        name: template.name,
        version: template.version,
        inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
      },
    };
  }

  // docs-rag kind (existing behaviour)
  const sources: SourceDefinition[] = template.sources.length > 0
    ? template.sources
    : sourcesFromDocsRagInputs(template, inputs);

  return {
    version: 1,
    sources,
    template: {
      id: template.id,
      name: template.name,
      version: template.version,
      inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
    },
  };
}

function sourcesFromDocsRagInputs(
  template: CatalogTemplate,
  inputs: Record<string, string>,
): SourceDefinition[] {
  if (template.id === 'docs-rag') {
    const url = inputs.url;
    if (!url) throw new Error('Template "docs-rag" requires --url <documentation-url>.');
    return [{ type: 'docs', url, label: 'docs' }];
  }

  if (template.id === 'github-docs') {
    const repo = inputs.repo;
    if (!repo) throw new Error('Template "github-docs" requires --repo <owner/name>.');
    return [{ type: 'github', repo, label: repo }];
  }

  throw new Error(`Template "${template.id}" needs sources or an input mapping.`);
}
