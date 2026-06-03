import { VERSION } from './version.js';
import fs from 'fs-extra';
import { logger } from './logger.js';

const REPO = 'JayLLM/hoolix'; // GitHub repo (keep stable); product branded as Hoolix
const GITHUB_RELEASES_API = `https://api.github.com/repos/${REPO}/releases`;

interface GitHubRelease {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  assetUrl?: string;
  assetName?: string;
}

function getPlatformAssetName(): string | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    if (arch === 'x64') return 'hoolix-windows-x64.exe';
    // GitHub Releases currently ship Windows x64; Windows on ARM can run it under emulation.
    if (arch === 'arm64') return 'hoolix-windows-x64.exe';
  }

  if (platform === 'darwin') {
    if (arch === 'x64') return 'hoolix-darwin-x64';
    if (arch === 'arm64') return 'hoolix-darwin-arm64';
  }

  if (platform === 'linux') {
    if (arch === 'x64') return 'hoolix-linux-x64';
    if (arch === 'arm64') return 'hoolix-linux-arm64';
  }

  return null;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = VERSION.replace(/^v/, '');
  const currentIsPrerelease = parseVersion(currentVersion).prerelease.length > 0;

  try {
    const res = await fetch(`${GITHUB_RELEASES_API}?per_page=20`, {
      headers: { 'User-Agent': 'hoolix-updater' },
    });

    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`);
    }

    const releases = (await res.json()) as GitHubRelease[];
    const candidates = releases
      .filter((release) => !release.draft)
      .filter((release) => currentIsPrerelease || !release.prerelease)
      .sort((a, b) => compareVersions(b.tag_name, a.tag_name));

    const release = candidates[0];
    if (!release) {
      return {
        currentVersion,
        latestVersion: currentVersion,
        isOutdated: false,
      };
    }

    const latestVersion = release.tag_name.replace(/^v/, '');

    const isOutdated = compareVersions(currentVersion, latestVersion) < 0;

    const assetName = getPlatformAssetName();
    const asset = assetName
      ? release.assets.find((a) => a.name === assetName)
      : undefined;

    return {
      currentVersion,
      latestVersion,
      isOutdated,
      assetUrl: asset?.browser_download_url,
      assetName: asset?.name,
    };
  } catch (err: any) {
    logger.debug('Update check failed:', err.message);
    return {
      currentVersion,
      latestVersion: currentVersion,
      isOutdated: false,
    };
  }
}

function parseVersion(version: string): ParsedVersion {
  const clean = version.replace(/^v/, '');
  const [core, prereleaseText = ''] = clean.split('-', 2);
  const [major = 0, minor = 0, patch = 0] = core
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));

  return {
    major,
    minor,
    patch,
    prerelease: prereleaseText ? prereleaseText.split('.') : [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ai = a[i];
    const bi = b[i];

    if (ai === undefined) return -1;
    if (bi === undefined) return 1;

    const an = Number.parseInt(ai, 10);
    const bn = Number.parseInt(bi, 10);
    const aiNumeric = ai === String(an);
    const biNumeric = bi === String(bn);

    if (aiNumeric && biNumeric) {
      if (an > bn) return 1;
      if (an < bn) return -1;
      continue;
    }

    if (aiNumeric) return -1;
    if (biNumeric) return 1;

    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }

  return 0;
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] > pb[key]) return 1;
    if (pa[key] < pb[key]) return -1;
  }

  return comparePrerelease(pa.prerelease, pb.prerelease);
}

export async function performUpdate(
  restartSlugs: string[] = [],
  options: { quiet?: boolean } = {},
): Promise<boolean> {
  const log = {
    info: (...args: Parameters<typeof logger.info>) => { if (!options.quiet) logger.info(...args); },
    warn: (...args: Parameters<typeof logger.warn>) => { if (!options.quiet) logger.warn(...args); },
    error: (...args: Parameters<typeof logger.error>) => { if (!options.quiet) logger.error(...args); },
    success: (...args: Parameters<typeof logger.success>) => { if (!options.quiet) logger.success(...args); },
  };
  const updateInfo = await checkForUpdate();

  if (!updateInfo.isOutdated) {
    log.success(`You are already on the latest version (${updateInfo.currentVersion}).`);
    return false;
  }

  if (!updateInfo.assetUrl || !updateInfo.assetName) {
    log.error('No suitable binary found for your platform in the latest release.');
    return false;
  }

  const currentExe = process.execPath;
  const isCompiledBinary =
    !currentExe.includes('node') && !currentExe.includes('bun');

  if (!isCompiledBinary) {
    log.warn('Auto-update is only supported for compiled binaries.');
    log.info(`Please run: bun run build:binary (or download manually from GitHub)`);
    return false;
  }

  log.info(`Updating from ${updateInfo.currentVersion} → ${updateInfo.latestVersion}...`);

  const tmpPath = currentExe + '.tmp';
  const backupPath = currentExe + '.old';

  try {
    // Download + stream to tmp
    log.info('Downloading new version...');

    const res = await fetch(updateInfo.assetUrl);
    if (!res.ok || !res.body) throw new Error('Failed to download update');

    const fileStream = fs.createWriteStream(tmpPath);
    // @ts-ignore - Node fetch body is Web stream; pipeTo WritableStream
    await new Promise((resolve, reject) => {
      res.body!.pipeTo(
        new WritableStream({
          write(chunk) {
            fileStream.write(chunk);
          },
          close() {
            fileStream.end(resolve);
          },
          abort(err) {
            fileStream.end();
            reject(err);
          },
        })
      );
    });

    // chmod on non-Windows
    if (process.platform !== 'win32') {
      await fs.chmod(tmpPath, 0o755);
    }

    log.info('Applying update...');

    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows cannot reliably overwrite/replace a running .exe from within the process
      // (even after renaming the old image away). Use a detached batch helper that
      // performs the replace shortly after this process exits. This is the standard
      // reliable pattern for self-updating single-exe CLIs on Windows.
      const batPath = currentExe + '.update.bat';

      // Build optional restart commands for servers that were running before the update.
      let restartPart = '';
      if (restartSlugs.length > 0) {
        restartPart = restartSlugs
          .map((slug) => `start /b "" "${currentExe}" start ${slug}`)
          .join('\r\n');
      }

      // Use full quoted paths; the batch waits briefly then does the moves + cleanup + relaunch + server restarts.
      const batContent = `@echo off
setlocal
timeout /t 2 /nobreak >nul 2>&1
if exist "${currentExe}" (
  move /y "${currentExe}" "${backupPath}" >nul 2>&1
)
if exist "${tmpPath}" (
  move /y "${tmpPath}" "${currentExe}" >nul 2>&1
)
if exist "${backupPath}" (
  del /f /q "${backupPath}" >nul 2>&1
)
echo hoolix updated successfully.
if exist "${currentExe}" (
  start "" "${currentExe}" %*
)
${restartPart}
del "%~f0" >nul 2>&1
`;

      await fs.writeFile(batPath, batContent);

      const { spawn } = await import('node:child_process');
      const child = spawn('cmd.exe', ['/c', batPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();

      log.success(`Successfully prepared update to version ${updateInfo.latestVersion}!`);
      log.info('This process will now exit; the new version will be applied and launched automatically in a moment.');

      // Exit promptly so the helper batch can manipulate the files without the old exe being locked.
      await new Promise((r) => setTimeout(r, 150));
      process.exit(0);
    } else {
      // Non-Windows: standard rename (current process not locking the file image the same way)
      if (await fs.pathExists(currentExe)) {
        await fs.rename(currentExe, backupPath).catch(() => {});
      }

      await fs.rename(tmpPath, currentExe);

      // cleanup backup
      await fs.remove(backupPath).catch(() => {});

      log.success(`Successfully updated to version ${updateInfo.latestVersion}!`);
      log.warn('Please restart the application for the update to take effect.');

      return true;
    }
  } catch (err: any) {
    log.error('Update failed:', err.message);

    // Best-effort rollback / cleanup
    if (await fs.pathExists(backupPath)) {
      try {
        await fs.rename(backupPath, currentExe);
        log.info('Rolled back to previous version.');
      } catch {}
    }

    await fs.remove(tmpPath).catch(() => {});

    // On Windows, also clean a potential leftover helper script
    if (process.platform === 'win32') {
      const batPath = currentExe + '.update.bat';
      await fs.remove(batPath).catch(() => {});
    }

    return false;
  }
}
