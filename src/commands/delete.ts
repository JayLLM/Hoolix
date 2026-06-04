import { confirm, isCancel, cancel } from '@clack/prompts';
import { getServerMetadata, deleteServer } from '../core/registry.js';
import { logger } from '../core/logger.js';
import { printJson } from '../ui/format.js';

export async function cmdDelete(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix delete <slug> --yes --json.' });
    else logger.error('Usage: hoolix delete <slug>');
    process.exit(1);
  }

  const meta = await getServerMetadata(slug).catch(() => null);
  if (!meta) {
    if (json) printJson({ ok: false, slug, error: `Server "${slug}" not found.` });
    else logger.error(`Server "${slug}" not found.`);
    process.exit(1);
  }

  const force = args.includes('--yes') || args.includes('-y');
  if (json && !force) {
    printJson({ ok: false, slug, error: 'Delete requires confirmation. Next: pass --yes with --json.' });
    process.exit(1);
  }

  let confirmed: boolean | symbol = force;
  if (!force) {
    confirmed = await confirm({
      message: `Permanently delete "${meta.name}" (${slug}) and all its data?`,
    });
  }
  if (isCancel(confirmed) || !confirmed) {
    cancel('Delete cancelled');
    return;
  }

  await deleteServer(slug);
  if (json) printJson({ ok: true, slug, deleted: true });
  else logger.success(`Deleted ${slug}`);
}
