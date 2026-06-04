import { getTemplate, listTemplates } from '../app/services/catalog.js';
import { getCommunityTemplateDir } from '../catalog/community.js';
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
  ui,
} from '../ui/format.js';

export async function cmdTemplates(args: string[], json: boolean): Promise<void> {
  const sub = args[1] || 'list';

  if (sub === 'list' || sub === 'ls') {
    const communityOnly = args.includes('--community');
    let templates = await listTemplates();
    if (communityOnly) templates = templates.filter((t) => t.category === 'community');

    if (json) {
      printJson(templates);
      return;
    }

    const communityCount = templates.filter((t) => t.category === 'community').length;
    const officialCount  = templates.length - communityCount;
    const subtitle = communityOnly
      ? `${communityCount} community template${communityCount === 1 ? '' : 's'}`
      : `${officialCount} official + ${communityCount} community template${templates.length === 1 ? '' : 's'}`;

    printTitle('Templates', subtitle);

    if (templates.length === 0 && communityOnly) {
      const dir = getCommunityTemplateDir();
      console.log(`  ${ui.muted('No community templates yet.')}`);
      console.log(`  Add JSON files to: ${ui.accent(dir)}`);
      console.log('');
      printCommand('hoolix templates info filesystem   (see official template format)');
      return;
    }

    const rows = templates.map((t) => ({
      ID:       t.id,
      Name:     truncate(t.name, 26),
      Kind:     t.kind ?? 'docs-rag',
      Category: t.category,
      Inputs:   [
        ...t.inputs.filter((i) => i.required).map((i) => i.name),
        ...t.credentials.filter((c) => c.required).map((c) => c.envVar ?? c.name),
      ].join(', ') || '—',
    }));

    printTable(rows);
    console.log('');
    printSection('Examples');
    printCommand('hoolix templates info filesystem');
    printCommand('hoolix templates info docs-rag');
    printCommand('hoolix create "My Files" --template filesystem --yes');
    printCommand('hoolix create "React Docs" --template docs-rag --url https://react.dev/llms.txt --yes');
    if (!communityOnly) {
      const dir = getCommunityTemplateDir();
      console.log('');
      console.log(`  ${ui.muted('Community templates dir:')} ${dir}`);
      console.log(`  ${ui.muted('Filter:')} hoolix templates list --community`);
    }
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

      const isMcpServer = (template.kind ?? 'docs-rag') === 'mcp-server';

      printTitle('Template', `${template.name} (${template.id})`);
      printDetails([
        ['Kind',        template.kind ?? 'docs-rag'],
        ['Version',     template.version],
        ['Category',    template.category],
        ['Description', template.description],
        ['Tags',        template.tags.join(', ')],
        ...(template.homepage ? [['Docs', template.homepage] as [string, string]] : []),
      ]);
      console.log('');

      // ── mcp-server kind ────────────────────────────────────────────────────
      if (isMcpServer && template.server) {
        const s = template.server;
        printSection('Server run config');
        printDetails([
          ['Transport', s.transport ?? 'stdio'],
          ['Command',   s.command],
          ['Args',      s.args.join(' ')],
          ...(s.npmPackage ? [['Package', s.npmPackage] as [string, string]] : []),
        ]);
        console.log('');
      }

      // Non-sensitive inputs
      if (template.inputs.length > 0) {
        printSection('Inputs (provided at create time)');
        for (const input of template.inputs) {
          const flag = `--input ${input.name}=<value>`;
          console.log(`  ${ui.accent(input.name)}${input.required ? ' (required)' : ''}  ${input.description}`);
          console.log(`  ${ui.muted('Flag:')} ${flag}${input.placeholder ? `  ${ui.muted('e.g. ' + input.placeholder)}` : ''}`);
          console.log('');
        }
      }

      // Sensitive credentials
      if (template.credentials.length > 0) {
        printSection('Credentials (stored in credentials.json, 0600)');
        for (const cred of template.credentials) {
          const envNote = cred.envVar ? `  ${ui.muted('Auto-detected from')} ${ui.accent(cred.envVar)}` : '';
          console.log(`  ${ui.accent(cred.name)}${cred.required ? ' (required)' : ''}  ${cred.description}`);
          if (envNote) console.log(`  ${envNote}`);
          if (cred.validationHint) console.log(`  ${ui.muted('Hint: ' + cred.validationHint)}`);
          if (cred.docsUrl) console.log(`  ${ui.muted('Docs: ' + cred.docsUrl)}`);
          console.log('');
        }
      }

      // docs-rag sources
      if (!isMcpServer && template.sources.length > 0) {
        printSection('Pre-baked sources');
        console.log(`  ${template.sources.map(sourceLabel).join(', ')}`);
        console.log('');
      }

      // Create example
      printSection('Create');
      if (isMcpServer) {
        const inputFlags = template.inputs
          .filter((i) => i.required)
          .map((i) => `--input ${i.name}=${i.placeholder ?? '<value>'}`)
          .join(' ');
        const credNote = template.credentials.filter((c) => c.required).length > 0
          ? `  ${ui.muted('(credentials will be prompted; or set env vars like')} ${template.credentials.filter((c) => c.envVar).map((c) => c.envVar).join(', ')}${ui.muted(')')}`
          : '';
        printCommand(`hoolix create "My ${template.name.replace(' MCP', '')}" --template ${template.id}${inputFlags ? ' ' + inputFlags : ''} --yes`);
        if (credNote) console.log(credNote);
        printCommand(`hoolix install ${template.id}`);
      } else if (template.id === 'docs-rag') {
        printCommand(`hoolix create "My Docs" --template ${template.id} --url https://example.com/llms.txt --yes`);
      } else if (template.id === 'github-docs') {
        printCommand(`hoolix create "Repo Docs" --template ${template.id} --repo owner/repo --yes`);
      } else {
        printCommand(`hoolix create "${template.name}" --template ${template.id} --yes`);
      }
      console.log('');
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
