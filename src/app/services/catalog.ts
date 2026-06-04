import {
  buildDefinitionFromTemplate,
  getOfficialTemplates,
  type CatalogTemplate,
} from '../../catalog/templates.js';
import { listCommunityTemplates } from '../../catalog/community.js';
import type { ServerDefinition } from '../../sources/types.js';

export interface TemplateInstantiation {
  template: CatalogTemplate;
  definition: ServerDefinition;
}

/**
 * Returns all templates: official (hardcoded) + community (from ~/.hoolix/templates/*.json).
 * Sorted alphabetically by name.
 */
export async function listTemplates(): Promise<CatalogTemplate[]> {
  const official  = getOfficialTemplates();
  const community = await listCommunityTemplates();
  return [...official, ...community].sort((a, b) => a.name.localeCompare(b.name));
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
