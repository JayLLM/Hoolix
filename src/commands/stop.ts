import { serverManager } from '../process/manager.js';
import { logger } from '../core/logger.js';
import { printJson } from '../ui/format.js';

export async function cmdStop(args: string[], json: boolean): Promise<void> {
  const slug = args[1];
  if (!slug) {
    if (json) printJson({ ok: false, error: 'Missing slug. Next: pass hoolix stop <slug> --json.' });
    else logger.error('Usage: hoolix stop <slug> [--json]');
    process.exit(1);
  }

  const stopped = await serverManager.stop(slug);
  if (json) {
    printJson({ ok: true, slug, stopped });
  } else if (stopped) {
    logger.success(`Stopped ${slug}`);
  } else {
    logger.info(`${slug} was not running.`);
  }
}
