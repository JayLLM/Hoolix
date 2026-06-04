import { getTemplate, listTemplates } from '../app/services/catalog.js';
import { sourceLabel } from '../sources/registry.js';
import { logger } from '../core/logger.js';
import {
  printCommand,
  printDetails,
  printJson,
  printSection,
  printTable,
  printTitle,
  truncate,
} from '../ui/format.js';

export async function cmdTemplates(args: string[], json: boolean): Promise<void> {
  const sub = args[1] || 'list';

  if (sub === 'list' || sub === 'ls') {
    const templates = await listTemplates();
    if (json) {
      printJson(templates);
      return;
    }

    printTitle('Templates', `${templates.length} official MCP server templates`);
    printTable(templates.map((template) => ({
      ID: template.id,
      Name: truncate(template.name, 28),
      Category: template.category,
      Inputs: template.inputs.filter((input) => input.required).map((input) => input.name).join(', ') || '-',
    })));
    console.log('');
    printSection('Examples');
    printCommand('hoolix templates info docs-rag');
    printCommand('hoolix create "React Docs" --template docs-rag --url https://react.dev/llms.txt --yes');
    printCommand('hoolix create "MCP Servers" --template github-docs --repo modelcontextprotocol/servers --yes');
    return;
  }

  if (sub === 'info' || sub === 'show') {
    const id = args[2];
    if (!id) {
      if (json) printJson({ ok: false, error: 'Missing template id. Next: run hoolix templates info <id>.' });
      else logger.error('Usage: hoolix templates info <id>');
      process.exit(1);
    }

    try {
      const template = await getTemplate(id);
      if (json) {
        printJson(template);
        return;
      }

      printTitle('Template', `${template.name} (${template.id})`);
      printDetails([
        ['Version', template.version],
        ['Category', template.category],
        ['Description', template.description],
        ['Tags', template.tags.join(', ')],
        ['Sources', template.sources.length > 0 ? template.sources.map(sourceLabel).join(', ') : 'provided by inputs'],
      ]);
      console.log('');
      if (template.inputs.length > 0) {
        printSection('Inputs');
        for (const input of template.inputs) {
          console.log(`  ${input.name}${input.required ? ' (required)' : ''}: ${input.description}`);
        }
        console.log('');
      }
      printSection('Create');
      if (template.id === 'docs-rag') {
        printCommand(`hoolix create "My Docs" --template ${template.id} --url https://example.com/llms.txt --yes`);
      } else if (template.id === 'github-docs') {
        printCommand(`hoolix create "Repo Docs" --template ${template.id} --repo owner/repo --yes`);
      } else {
        printCommand(`hoolix create "${template.name}" --template ${template.id} --yes`);
      }
      return;
    } catch (e: any) {
      if (json) printJson({ ok: false, error: e?.message || String(e) });
      else logger.error(e?.message || e);
      process.exit(1);
    }
  }

  if (json) {
    printJson({ ok: false, error: `Unknown templates command "${sub}". Next: use list or info.` });
  } else {
    logger.error(`Unknown templates command "${sub}". Next: run hoolix templates list.`);
  }
  process.exit(1);
}
