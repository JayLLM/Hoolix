import { confirm, isCancel, cancel } from '@clack/prompts';
import { getServerMetadata, updateServerMetadata } from '../core/registry.js';
import { logger } from '../core/logger.js';
import { generateAuthKey } from '../lib/auth.js';
import { printTitle, printDetails, printCommand, printJson, maskSecret, ui } from '../ui/format.js';

export async function cmdRotateKey(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix rotate <slug> --yes --json.' });
    else logger.error('Usage: hoolix rotate <slug> [--yes] [--json]');
    process.exit(1);
  }

  let meta: any;
  try {
    meta = await getServerMetadata(slug);
  } catch {
    if (json) printJson({ ok: false, slug, error: `Server "${slug}" not found.` });
    else logger.error(`Server "${slug}" not found.`);
    process.exit(1);
  }

  const force = args.includes('--yes') || args.includes('-y');
  if (json && !force) {
    printJson({ ok: false, slug, error: 'Key rotation requires confirmation. Next: pass --yes with --json.' });
    process.exit(1);
  }

  let confirmed: boolean | symbol = force;
  if (!force) {
    confirmed = await confirm({
      message: `Rotate auth key for "${meta.name}" (${slug})? Existing clients will need the new key.`,
    });
  }
  if (isCancel(confirmed) || !confirmed) {
    cancel('Key rotation cancelled');
    return;
  }

  const oldKey = meta.authKey;
  const newKey = generateAuthKey();
  await updateServerMetadata(slug, { authKey: newKey } as any);

  if (json) {
    printJson({
      ok: true,
      slug,
      oldKey: maskSecret(oldKey),
      newKey,
      restartRequired: true,
      next: [`hoolix stop ${slug}`, `hoolix start ${slug}`, `hoolix connect ${slug} --client cursor --yes`],
    });
    return;
  }

  printTitle('Key rotated', slug);
  printDetails([
    ['Old key (no longer valid)', maskSecret(oldKey)],
    ['New key', newKey],
  ]);
  console.log('');
  logger.warn('Any running server for this slug must be stopped and restarted to pick up the new key.');
  printCommand(`hoolix stop ${slug}`);
  printCommand(`hoolix start ${slug}`);
  printCommand(`hoolix connect ${slug} --client cursor`);
  console.log(`  ${ui.muted('Audit previous activity:')} hoolix audit ${slug} --json`);
}
