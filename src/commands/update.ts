import { checkForUpdate, performUpdate, getInstallMethod } from '../core/updater.js';
import { listServers } from '../core/registry.js';
import { serverManager } from '../process/manager.js';
import { logger } from '../core/logger.js';
import { printJson } from '../ui/format.js';

export async function cmdUpdate(args: string[], json: boolean): Promise<void> {
  const noVerify = args.includes('--no-verify');
  const installMethod = getInstallMethod();
  if (!json) logger.info('Checking for updates...');
  if (!json && installMethod === 'npm') {
    logger.info('Installed via npm. For updates: npm update -g hoolix');
  }

  const updateInfo = await checkForUpdate();
  if (!updateInfo.isOutdated) {
    if (json) printJson({ ok: true, updated: false, installMethod, ...updateInfo });
    else logger.success(`You are already on the latest version (${updateInfo.currentVersion}).`);
    return;
  }

  // Stop running servers before update (they may hold binary locks on Windows)
  let restartSlugs: string[] = [];
  try {
    const allServers = await listServers();
    for (const s of allServers) {
      const st = await serverManager.getStatus(s.slug);
      if (st.running) restartSlugs.push(s.slug);
    }
  } catch (e: any) {
    logger.warn('Failed to enumerate running servers before update:', e.message || e);
  }

  if (restartSlugs.length > 0) {
    if (!json) logger.info(`Stopping ${restartSlugs.length} running server(s) before update: ${restartSlugs.join(', ')}`);
    for (const slug of restartSlugs) {
      try {
        await serverManager.stop(slug, true);
        if (!json) logger.info(`Stopped ${slug}`);
      } catch (e: any) {
        if (!json) logger.warn(`Failed to stop ${slug} before update: ${e.message || e}`);
      }
    }
  }

  try {
    const success = await performUpdate(restartSlugs, { quiet: json, noVerify });
    if (success) {
      if (json) printJson({ ok: true, updated: true, ...updateInfo, restarted: restartSlugs });
      else logger.success('Update completed successfully!');
      if (restartSlugs.length > 0 && process.platform !== 'win32') {
        if (!json) logger.info('Restarting previously running servers...');
        for (const slug of restartSlugs) {
          try {
            await serverManager.start(slug);
            if (!json) logger.info(`Restarted ${slug}`);
          } catch (e: any) {
            if (!json) logger.warn(`Failed to restart ${slug} after update: ${e.message || e}`);
          }
        }
      }
    } else if (json) {
      printJson({
        ok:        false,
        updated:   false,
        ...updateInfo,
        restarted: restartSlugs,
        error:     updateInfo.assetName
          ? 'Auto-update could not be applied. Next: download the release asset manually or run from a compiled binary.'
          : 'No suitable binary asset was found for this platform in the latest release.',
      });
      process.exit(1);
    }
  } catch (err: any) {
    if (json) printJson({ ok: false, updated: false, error: err.message || String(err), restarted: restartSlugs });
    else logger.error('Update failed:', err.message || err);
    // Best effort: restart servers even if update failed
    if (restartSlugs.length > 0) {
      logger.info('Attempting to restart servers after failed update...');
      for (const slug of restartSlugs) {
        try { await serverManager.start(slug); } catch {}
      }
    }
    process.exit(1);
  }
}
