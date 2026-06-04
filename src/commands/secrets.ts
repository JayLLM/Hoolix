/**
 * hoolix secrets list   <slug>           — show masked credential keys
 * hoolix secrets set    <slug> <key> [value]  — add or update a credential
 * hoolix secrets remove <slug> <key>     — delete a credential
 *
 * Credentials live in credentials.json (0600) alongside metadata.json.
 * Values are never printed in full; only masked (first 6 chars … last 6).
 */

import { text, password, confirm, isCancel, cancel } from '@clack/prompts';
import { getServerMetadata } from '../core/registry.js';
import { ServerNotFoundError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import {
  loadCredentials,
  updateCredential,
  removeCredential,
  maskCredentials,
} from '../app/services/credentials.js';
import { getTemplate } from '../app/services/catalog.js';
import {
  printTitle, printSection, printDetails, printCommand, printJson, ui,
} from '../ui/format.js';

// ── Subcommands ───────────────────────────────────────────────────────────────

async function cmdSecretsList(slug: string, json: boolean): Promise<void> {
  let meta: any;
  try {
    meta = await getServerMetadata(slug);
  } catch (e: any) {
    const msg = e instanceof ServerNotFoundError
      ? `Server "${slug}" not found. Run "hoolix list".`
      : e?.message || String(e);
    if (json) printJson({ ok: false, slug, error: msg });
    else logger.error(msg);
    process.exit(1);
  }

  if ((meta.serverKind ?? 'docs-rag') !== 'mcp-server') {
    const msg = `"${slug}" is a docs-rag server. Secrets management is for mcp-server kind servers only.`;
    if (json) printJson({ ok: false, slug, error: msg });
    else logger.error(msg);
    process.exit(1);
  }

  const credentials = await loadCredentials(slug);
  const templateId = meta.definition?.template?.id;
  const template = templateId
    ? await getTemplate(templateId).catch(() => null)
    : null;
  const masked = maskCredentials(credentials, template ?? undefined);
  const credKeys: string[] = meta.credentialKeys ?? Object.keys(credentials);

  if (json) {
    printJson({
      ok: true,
      slug,
      templateId,
      credentialKeys: credKeys,
      credentials: masked,
    });
    return;
  }

  printTitle('Secrets', `${meta.name} (${slug})`);
  printDetails([
    ['Template', templateId ? `${template?.name ?? templateId} (${templateId})` : 'unknown'],
    ['Kind',     'mcp-server'],
  ]);
  console.log('');

  if (credKeys.length === 0) {
    console.log(`  ${ui.muted('No credentials stored.')}`);
    console.log('');
    if (template?.credentials.length) {
      printSection('Expected credentials');
      for (const c of template.credentials) {
        const envNote = c.envVar ? `  ${ui.muted('env: ' + c.envVar)}` : '';
        console.log(`  ${ui.accent(c.name)}${c.required ? ' (required)' : ''}  ${c.description}${envNote}`);
      }
      console.log('');
      printCommand(`hoolix secrets set ${slug} ${template.credentials[0]?.name ?? '<key>'} <value>`);
    }
    return;
  }

  printSection('Stored credentials (values masked)');
  for (const key of credKeys) {
    const credDef = template?.credentials.find((c) => c.name === key);
    const label   = credDef?.label ?? key;
    const maskedVal = masked[key] ?? ui.muted('(missing from credentials.json)');
    const envNote   = credDef?.envVar ? `  ${ui.muted('env: ' + credDef.envVar)}` : '';
    console.log(`  ${ui.muted(key.padEnd(20))}  ${maskedVal}  ${ui.muted(label)}${envNote}`);
  }
  console.log('');
  printSection('Next');
  printCommand(`hoolix secrets set ${slug} <key> <new-value>`);
  printCommand(`hoolix connect ${slug}   (regenerate client config after updating)`);
  console.log('');
}

async function cmdSecretsSet(
  slug: string,
  key: string,
  value: string | undefined,
  json: boolean,
  force: boolean,
): Promise<void> {
  let meta: any;
  try {
    meta = await getServerMetadata(slug);
  } catch (e: any) {
    const msg = e instanceof ServerNotFoundError
      ? `Server "${slug}" not found. Run "hoolix list".`
      : e?.message || String(e);
    if (json) printJson({ ok: false, slug, error: msg });
    else logger.error(msg);
    process.exit(1);
  }

  if ((meta.serverKind ?? 'docs-rag') !== 'mcp-server') {
    const msg = `"${slug}" is a docs-rag server. Secrets management is for mcp-server kind servers only.`;
    if (json) printJson({ ok: false, slug, error: msg });
    else logger.error(msg);
    process.exit(1);
  }

  // Resolve value: positional > interactive
  let resolvedValue = value;
  if (!resolvedValue) {
    if (json || force) {
      const msg = `Value for "${key}" is required. Pass it as the third argument or via --value <v>.`;
      if (json) printJson({ ok: false, slug, key, error: msg });
      else logger.error(msg);
      process.exit(1);
    }

    // Interactive: masked input for sensitive credentials
    const templateId = meta.definition?.template?.id;
    const template = templateId ? await getTemplate(templateId).catch(() => null) : null;
    const credDef = template?.credentials.find((c) => c.name === key);
    const label = credDef?.label ?? key;
    const hint  = credDef?.validationHint ? ` (${credDef.validationHint})` : '';
    const isSensitive = credDef?.sensitive !== false;

    const raw = isSensitive
      ? await password({ message: `New value for ${label}${hint}` })
      : await text({
          message: `New value for ${label}${hint}`,
          placeholder: credDef?.placeholder ?? '',
          validate: (v) => (v && v.trim().length > 0 ? undefined : `${label} is required`),
        });

    if (isCancel(raw)) { cancel('Cancelled'); process.exit(0); }
    resolvedValue = String(raw).trim();
  }

  if (!resolvedValue) {
    if (json) printJson({ ok: false, slug, key, error: 'Value cannot be empty.' });
    else logger.error('Value cannot be empty.');
    process.exit(1);
  }

  const keys = await updateCredential(slug, key, resolvedValue);

  // Mask for display
  const maskedDisplay = resolvedValue.length <= 12
    ? `${resolvedValue.slice(0, 2)}...`
    : `${resolvedValue.slice(0, 6)}...${resolvedValue.slice(-6)}`;

  if (json) {
    printJson({ ok: true, slug, key, credentialKeys: keys });
    return;
  }

  console.log(`  ${ui.success('✓')} Credential "${key}" updated for "${meta.name}" (${maskedDisplay})`);
  console.log('');
  printSection('Next');
  printCommand(`hoolix connect ${slug}   (regenerate client config — tokens are resolved at connect time)`);
  printCommand(`hoolix client status     (verify which clients are wired)`);
  console.log('');
}

async function cmdSecretsRemove(
  slug: string,
  key: string,
  json: boolean,
  force: boolean,
): Promise<void> {
  let meta: any;
  try {
    meta = await getServerMetadata(slug);
  } catch (e: any) {
    const msg = e instanceof ServerNotFoundError
      ? `Server "${slug}" not found.`
      : e?.message || String(e);
    if (json) printJson({ ok: false, slug, error: msg });
    else logger.error(msg);
    process.exit(1);
  }

  if ((meta.serverKind ?? 'docs-rag') !== 'mcp-server') {
    const msg = `"${slug}" is a docs-rag server. Secrets management is for mcp-server kind servers only.`;
    if (json) printJson({ ok: false, slug, error: msg });
    else logger.error(msg);
    process.exit(1);
  }

  // Confirm unless --yes
  if (!force && !json) {
    const ok = await confirm({ message: `Remove credential "${key}" from "${meta.name}"?` });
    if (isCancel(ok) || !ok) { cancel('Cancelled'); process.exit(0); }
  } else if (json && !force) {
    printJson({ ok: false, slug, key, error: 'Removal requires --yes with --json.' });
    process.exit(1);
  }

  // Warn if removing a required credential
  const templateId = meta.definition?.template?.id;
  const template = templateId ? await getTemplate(templateId).catch(() => null) : null;
  const credDef = template?.credentials.find((c) => c.name === key);
  if (credDef?.required && !json) {
    logger.warn(`"${key}" is a required credential for template "${templateId}". The server may not work correctly without it.`);
  }

  const existing = await loadCredentials(slug);
  if (!(key in existing)) {
    const msg = `Credential "${key}" not found in "${slug}".`;
    if (json) printJson({ ok: false, slug, key, error: msg });
    else logger.warn(msg);
    return;
  }

  const remainingKeys = await removeCredential(slug, key);

  if (json) {
    printJson({ ok: true, slug, key, credentialKeys: remainingKeys });
    return;
  }

  console.log(`  ${ui.success('✓')} Credential "${key}" removed from "${meta.name}"`);
  if (remainingKeys.length > 0) {
    console.log(`  ${ui.muted('Remaining:')} ${remainingKeys.join(', ')}`);
  } else {
    console.log(`  ${ui.muted('No credentials remaining.')}`);
  }
  console.log('');
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function cmdSecrets(args: string[], json: boolean): Promise<void> {
  // args[0] = 'secrets' | 'secret', args[1] = sub, args[2] = slug, ...
  const sub  = args[1];
  const force = args.includes('--yes') || args.includes('-y');

  if (!sub || sub === 'list' || sub === 'ls') {
    // hoolix secrets list <slug>  OR  hoolix secrets <slug>  (shorthand)
    const slug = args[2] ?? sub;  // allow 'hoolix secrets <slug>' as shorthand for list
    if (!slug || slug === 'list' || slug === 'ls') {
      if (json) printJson({ ok: false, error: 'Usage: hoolix secrets list <slug>' });
      else logger.error('Usage: hoolix secrets list <slug>');
      process.exit(1);
    }
    await cmdSecretsList(slug, json);
    return;
  }

  if (sub === 'set') {
    const slug = args[2];
    const key  = args[3];
    // Value can come from positional arg or --value flag
    const valueIdx = args.indexOf('--value');
    const value = valueIdx !== -1 && args[valueIdx + 1]
      ? args[valueIdx + 1]
      : args[4];
    if (!slug || !key) {
      if (json) printJson({ ok: false, error: 'Usage: hoolix secrets set <slug> <key> <value>' });
      else logger.error('Usage: hoolix secrets set <slug> <key> [value]');
      process.exit(1);
    }
    await cmdSecretsSet(slug, key, value, json, force);
    return;
  }

  if (sub === 'remove' || sub === 'rm' || sub === 'delete') {
    const slug = args[2];
    const key  = args[3];
    if (!slug || !key) {
      if (json) printJson({ ok: false, error: 'Usage: hoolix secrets remove <slug> <key>' });
      else logger.error('Usage: hoolix secrets remove <slug> <key>');
      process.exit(1);
    }
    await cmdSecretsRemove(slug, key, json, force);
    return;
  }

  // Fallback: treat first unknown arg as slug (shorthand: hoolix secrets <slug>)
  if (/^[a-z0-9-]+$/.test(sub)) {
    await cmdSecretsList(sub, json);
    return;
  }

  if (json) printJson({ ok: false, error: `Unknown secrets sub-command "${sub}". Use list, set, or remove.` });
  else logger.error(`Unknown sub-command "${sub}". Next: hoolix secrets list|set|remove <slug>`);
  process.exit(1);
}
