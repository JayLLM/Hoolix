import { z } from 'zod';
import { SourceDefinitionSchema, type ServerDefinition, type SourceDefinition } from '../sources/types.js';

export const TemplateInputSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
});

export const CatalogTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().min(1),
  version: z.string().min(1),
  category: z.enum(['docs', 'github', 'official', 'example']),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  inputs: z.array(TemplateInputSchema).default([]),
  sources: z.array(SourceDefinitionSchema).default([]),
});

export type CatalogTemplate = z.infer<typeof CatalogTemplateSchema>;
export type TemplateInput = z.infer<typeof TemplateInputSchema>;

const OFFICIAL_TEMPLATES: CatalogTemplate[] = [
  {
    id: 'docs-rag',
    name: 'Documentation RAG MCP',
    version: '1.0.0',
    category: 'docs',
    description: 'Turn one documentation URL, llms.txt, or docs page into a grounded Hoolix MCP server.',
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
    sources: [],
  },
  {
    id: 'github-docs',
    name: 'GitHub Repository Docs MCP',
    version: '1.0.0',
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
    sources: [],
  },
  {
    id: 'terraform-aws-docs',
    name: 'Terraform AWS Docs MCP',
    version: '1.0.0',
    category: 'official',
    description: 'A starter MCP server for Terraform AWS provider documentation.',
    tags: ['terraform', 'aws', 'infrastructure'],
    inputs: [],
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
    category: 'example',
    description: 'Example template for indexing the Hoolix README from GitHub.',
    tags: ['hoolix', 'example', 'github'],
    inputs: [],
    sources: [
      {
        type: 'github',
        repo: 'JayLLM/hoolix',
        label: 'JayLLM/hoolix',
      },
    ],
  },
];

export function getOfficialTemplates(): CatalogTemplate[] {
  return OFFICIAL_TEMPLATES.map((template) => CatalogTemplateSchema.parse(template));
}

export function buildDefinitionFromTemplate(
  template: CatalogTemplate,
  inputs: Record<string, string> = {},
): ServerDefinition {
  const sources: SourceDefinition[] = template.sources.length > 0
    ? template.sources
    : sourcesFromInputs(template, inputs);

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

function sourcesFromInputs(template: CatalogTemplate, inputs: Record<string, string>): SourceDefinition[] {
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
