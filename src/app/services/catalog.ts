import {
  buildDefinitionFromTemplate,
  getOfficialTemplates,
  type CatalogTemplate,
} from '../../catalog/templates.js';
import type { ServerDefinition } from '../../sources/types.js';

export interface TemplateInstantiation {
  template: CatalogTemplate;
  definition: ServerDefinition;
}

export async function listTemplates(): Promise<CatalogTemplate[]> {
  return getOfficialTemplates().sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTemplate(id: string): Promise<CatalogTemplate> {
  const template = (await listTemplates()).find((candidate) => candidate.id === id);
  if (!template) {
    throw new Error(`Template "${id}" not found. Next: run "hoolix templates list" to see available templates.`);
  }
  return template;
}

export async function instantiateTemplate(
  id: string,
  inputs: Record<string, string> = {},
): Promise<TemplateInstantiation> {
  const template = await getTemplate(id);
  return {
    template,
    definition: buildDefinitionFromTemplate(template, inputs),
  };
}
