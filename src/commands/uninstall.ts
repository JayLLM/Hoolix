import path from 'node:path';
import fs from 'fs-extra';
import { spawn, execSync } from 'node:child_process';
import { confirm, isCancel, cancel } from '@clack/prompts';
import { listServers, deleteServer } from '../core/registry.js';
import { serverManager } from '../process/manager.js';
import { getPaths } from '../core/paths.js';
import { logger } from '../core/logger.js';
import { printJson } from '../ui/format.js';

export async function cmdUninstall(args: string[], json: boolean): Promise<void> {
  const force = args.includes('--yes') || args.includes('-y');

  if (json && !force) {
    printJson({ ok: false, error: 'Uninstall requires confirmation. Next: pass --yes with --json.' });
    process.exit(1);
  }

  if (!force) {
    const confirmed = await confirm({
      message: 'Permanently uninstall hoolix? This will stop all servers, delete ALL data/servers/configs, remove the binary, and clean up PATH entries (on Windows). Cannot be undone.',
    });
    if (isCancel(confirmed) || !confirmed) {
      cancel('Uninstall cancelled');
      return;
    }
  }

  if (!json) logger.info('Starting uninstall...');

  // Stop and delete all servers (best effort)
  try {
    const servers = await listServers();
    for (const s of servers) {
      try {
        const st = await serverManager.getStatus(s.slug);
        if (st.running) {
          await serverManager.stop(s.slug, true);
          if (!json) logger.info(`Stopped ${s.slug}`);
        }
      } catch {}
      await deleteServer(s.slug, { removeData: true });
    }
    if (servers.length > 0 && !json) logger.info(`Removed ${servers.length} server(s)`);
  } catch (e: any) {
    if (!json) logger.warn('Some servers could not be cleaned:', e.message);
  }

  // Remove the entire data directory
  try {
    const { data: dataDir } = getPaths();
    if (await fs.pathExists(dataDir)) {
      await fs.remove(dataDir);
      if (!json) logger.info(`Removed data directory: ${dataDir}`);
    }
  } catch (e: any) {
    if (!json) logger.warn('Could not remove data dir:', e.message);
  }

  const currentExe = process.execPath;
  const isCompiledBinary = !currentExe.includes('node') && !currentExe.includes('bun');

  if (isCompiledBinary) {
    const installDir = path.dirname(currentExe);

    if (process.platform === 'win32') {
      try {
        const escapedDir = installDir.replace(/\\/g, '\\\\');
        const psCmd = `[Environment]::GetEnvironmentVariable('PATH','User') -split ';' | Where-Object { $_.TrimEnd('\\') -ine '${escapedDir}' } | Join-String -Separator ';' | ForEach-Object { [Environment]::SetEnvironmentVariable('PATH', $_, 'User') }`;
        execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'ignore' });
        if (!json) logger.info(`Removed ${installDir} from user PATH.`);
      } catch {
        if (!json) logger.warn('Could not automatically remove from PATH (edit manually if needed).');
      }

      const batPath    = currentExe + '.uninstall.bat';
      const batContent = `@echo off\nsetlocal\ntimeout /t 2 /nobreak >nul 2>&1\nif exist "${currentExe}" del /f /q "${currentExe}" >nul 2>&1\nif exist "${installDir}" rd /s /q "${installDir}" >nul 2>&1\necho hoolix completely uninstalled.\ndel "%~f0" >nul 2>&1\n`;
      await fs.writeFile(batPath, batContent);

      spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref();

      if (json) printJson({ ok: true, removedData: true, compiledBinary: true, uninstallPrepared: true, installDir });
      else {
        logger.success('Uninstall prepared.');
        logger.info('This process will exit now; the binary and install directory will be removed shortly.');
      }
      await new Promise((r) => setTimeout(r, 150));
      process.exit(0);
    } else {
      try {
        await fs.remove(currentExe);
        if (!json) logger.info(`Removed binary: ${currentExe}`);
      } catch (e: any) {
        if (!json) logger.warn(`Could not remove binary ${currentExe}: ${e.message}`);
      }
      if (!json) logger.info('If you manually added the install directory to PATH in your shell config (~/.bashrc etc.), remove the entry there.');
    }
  } else {
    if (!json) logger.info('Not running as a compiled binary — only data was cleaned. Remove the package/source manually if desired.');
  }

  if (json) printJson({ ok: true, removedData: true, compiledBinary: isCompiledBinary });
  else logger.success('hoolix has been fully uninstalled and cleaned up.');
}
