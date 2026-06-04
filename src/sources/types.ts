import { z } from 'zod';

export const SourceDefinitionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('docs'),
    url: z.string().url(),
    label: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    cookie: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('llms'),
    url: z.string().url(),
    label: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    cookie: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('web'),
    url: z.string().url(),
    label: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    cookie: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('github'),
    repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    ref: z.string().min(1).optional(),
    paths: z.array(z.string().min(1)).optional(),
    label: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('manual'),
    url: z.string().url(),
    label: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    cookie: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('custom'),
    provider: z.string().regex(/^[a-z0-9-]{1,64}$/),
    value: z.string().min(1),
    label: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    cookie: z.string().min(1).optional(),
  }),
]);

export type SourceDefinition = z.infer<typeof SourceDefinitionSchema>;

export const TemplateReferenceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  inputs: z.record(z.string(), z.string()).optional(),
});

export type TemplateReference = z.infer<typeof TemplateReferenceSchema>;

export const ServerDefinitionSchema = z.object({
  version: z.literal(1).default(1),
  // min(1) relaxed: mcp-server kind templates have no sources (run config lives in template)
  sources: z.array(SourceDefinitionSchema).default([]),
  template: TemplateReferenceSchema.optional(),
});

export type ServerDefinition = z.infer<typeof ServerDefinitionSchema>;

export interface SourceSummary {
  count: number;
  labels: string[];
  primary: SourceDefinition;
}
