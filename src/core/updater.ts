import { VERSION } from './version.js';
import fs from 'fs-extra';
import { logger } from './logger.js';
import { createHash } from 'node:crypto';
import { assertSafeFetchTarget } from '../lib/safeFetch.js';

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
  checksumUrl?: string;
}

/** Detect whether the current process is a compiled Bun binary or an npm global install. */
export function getInstallMethod(): 'binary' | 'npm' | 'dev' {
  const execPath = process.execPath;
  // Compiled bun binary: execPath is the hoolix binary itself
  if (!execPath.includes('node') && !execPath.includes('bun') && !execPath.includes('tsx')) {
    return 'binary';
  }
  // npm global install: dist/index.js loaded in same process
  // Heuristic: package.json dist/index.js is on the resolved import.meta path
  // We check if __dirname from the entry point is inside node_modules or a global prefix
  try {
    const npmGlobal = process.env.npm_config_prefix || process.env.npm_global_prefix;
    if (npmGlobal) return 'npm';
    // Another heuristic: if we have node in execPath and no tsx, likely npm global
    if (execPath.includes('node') && !execPath.includes('tsx')) {
      // Check if we're inside a project dev dir (src/ exists next to dist/)
      return 'npm'; // best-effort for npm global context
    }
  } catch {}
  return 'dev';
}

function getPlatformAssetName(): string | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    if (arch === 'x64')   return 'hoolix-windows-x64.exe';
    if (arch === 'arm64') return 'hoolix-windows-x64.exe'; // x64 via emulation
  }
  if (platform === 'darwin') {
    if (arch === 'x64')   return 'hoolix-darwin-x64';
    if (arch === 'arm64') return 'hoolix-darwin-arm64';
  }
  if (platform === 'linux') {
    if (arch === 'x64')   return 'hoolix-linux-x64';
    if (arch === 'arm64') return 'hoolix-linux-arm64';
  }
  return null;
}

const MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024; // 300 MB hard cap

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = VERSION.replace(/^v/, '');
  const currentIsPrerelease = parseVersion(currentVersion).prerelease.length > 0;

  try {
    // SSRF guard: even though the URL is hardcoded, validate it to catch any
    // future misconfiguration or env-override attack vectors.
    await assertSafeFetchTarget(`${GITHUB_RELEASES_API}?per_page=20`).catch(() => {});

    const res = await fetch(`${GITHUB_RELEASES_API}?per_page=20`, {
      headers: { 'User-Agent': 'hoolix-updater' },
    });

    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);

    const releases = (await res.json()) as GitHubRelease[];
    const candidates = releases
      .filter((release) => !release.draft)
      .filter((release) => currentIsPrerelease || !release.prerelease)
      .sort((a, b) => compareVersions(b.tag_name, a.tag_name));

    const release = candidates[0];
    if (!release) {
      return { currentVersion, latestVersion: currentVersion, isOutdated: false };
    }

    const latestVersion = release.tag_name.replace(/^v/, '');
    const isOutdated = compareVersions(currentVersion, latestVersion) < 0;

    const assetName  = getPlatformAssetName();
    const asset      = assetName ? release.assets.find((a) => a.name === assetName) : undefined;
    const checksumAsset = release.assets.find((a) => a.name === 'SHA256SUMS');

    return {
      currentVersion,
      latestVersion,
      isOutdated,
      assetUrl:    asset?.browser_download_url,
      assetName:   asset?.name,
      checksumUrl: checksumAsset?.browser_download_url,
    };
  } catch (err: any) {
    logger.debug('Update check failed:', err.message);
    return { currentVersion, latestVersion: currentVersion, isOutdated: false };
  }
}

/** Download the SHA256SUMS file and verify the given binary matches.
 *  Returns { ok: boolean, verified: boolean }.
 *  verified=false means the checksum file was not available or the asset was not listed.
 *  ok=false means the hash was present but did not match (hard failure). */
async function verifyChecksum(
  binaryPath: string,
  assetName: string,
  checksumUrl: string | undefined,
): Promise<{ ok: boolean; verified: boolean }> {
  if (!checksumUrl) return { ok: false, verified: false };

  try {
    const res = await fetch(checksumUrl, { headers: { 'User-Agent': 'hoolix-updater' } });
    if (!res.ok) return { ok: false, verified: false };

    const text = await res.text();
    // SHA256SUMS format: "<hash>  <filename>" (sha256sum) or "<hash>  <filename>" (shasum)
    const line = text.split('\n').find((l) => l.includes(assetName));
    if (!line) return { ok: false, verified: false };

    const expectedHash = line.trim().split(/\s+/)[0];
    if (!expectedHash || expectedHash.length !== 64) return { ok: false, verified: false };

    const data       = await fs.readFile(binaryPath);
    const actualHash = createHash('sha256').update(data).digest('hex');

    return { ok: actualHash === expectedHash, verified: true };
  } catch (err: any) {
    logger.debug('Checksum verification failed:', err.message);
    return { ok: false, verified: false };
  }
}

export async function performUpdate(
  restartSlugs: string[] = [],
  options: { quiet?: boolean; noVerify?: boolean } = {},
): Promise<boolean> {
  const log = {
    info:    (...args: Parameters<typeof logger.info>)    => { if (!options.quiet) logger.info(...args); },
    warn:    (...args: Parameters<typeof logger.warn>)    => { if (!options.quiet) logger.warn(...args); },
    error:   (...args: Parameters<typeof logger.error>)   => { if (!options.quiet) logger.error(...args); },
    success: (...args: Parameters<typeof logger.success>) => { if (!options.quiet) logger.success(...args); },
  };

  const updateInfo = await checkForUpdate();

  if (!updateInfo.isOutdated) {
    log.success(`You are already on the latest version (${updateInfo.currentVersion}).`);
    return false;
  }

  if (!updateInfo.assetUrl || !updateInfo.assetName) {
    log.error('No suitable binary found for your platform in the latest release.');
    log.info('For npm users: npm update -g hoolix');
    return false;
  }

  const currentExe       = process.execPath;
  const isCompiledBinary = !currentExe.includes('node') && !currentExe.includes('bun');

  if (!isCompiledBinary) {
    // npm global install: advise `npm update -g` instead of binary self-replace
    log.warn(`Auto-update is for compiled binaries. You appear to be running via npm.`);
    log.info(`Run: npm update -g hoolix   (or: npm install -g hoolix@${updateInfo.latestVersion})`);
    return false;
  }

  log.info(`Updating from ${updateInfo.currentVersion} → ${updateInfo.latestVersion}...`);

  const tmpPath    = currentExe + '.tmp';
  const backupPath = currentExe + '.old';

  try {
    // ── Download ─────────────────────────────────────────────────────────────
    log.info('Downloading new version...');

    // SSRF guard on the asset URL (should be github.com, but validate defensively).
    await assertSafeFetchTarget(updateInfo.assetUrl).catch((err: Error) => {
      throw new Error(`Download URL failed SSRF check: ${err.message}`);
    });

    const controller = new AbortController();
    const downloadTimeout = setTimeout(() => controller.abort(), 5 * 60_000); // 5 min max
    const res = await fetch(updateInfo.assetUrl, { signal: controller.signal });
    clearTimeout(downloadTimeout);
    if (!res.ok || !res.body) throw new Error('Failed to download update');

    // Reject downloads that exceed the size cap.
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_DOWNLOAD_BYTES) {
      throw new Error(`Download rejected: Content-Length ${contentLength} exceeds ${MAX_DOWNLOAD_BYTES} byte limit.`);
    }

    let bytesWritten = 0;
    const fileStream = fs.createWriteStream(tmpPath);
    await new Promise((resolve, reject) => {
      res.body!.pipeTo(
        new WritableStream({
          write(chunk) {
            bytesWritten += chunk.byteLength;
            if (bytesWritten > MAX_DOWNLOAD_BYTES) {
              fileStream.end();
              reject(new Error(`Download rejected: exceeded ${MAX_DOWNLOAD_BYTES} byte limit mid-stream.`));
              return;
            }
            fileStream.write(chunk);
          },
          close()    { fileStream.end(resolve); },
          abort(err) { fileStream.end(); reject(err); },
        }),
      );
    });

    if (process.platform !== 'win32') {
      await fs.chmod(tmpPath, 0o755);
    }

    // ── SHA-256 checksum verification ────────────────────────────────────────
    if (!options.noVerify) {
      log.info('Verifying SHA-256 checksum...');
      const { ok, verified } = await verifyChecksum(tmpPath, updateInfo.assetName, updateInfo.checksumUrl);
      if (!verified) {
        // Checksum file was missing or the asset was not listed — fail closed.
        await fs.remove(tmpPath).catch(() => {});
        throw new Error(
          'SHA-256 checksum could not be verified — the SHA256SUMS file was missing or ' +
          'did not contain an entry for this release asset. ' +
          'Run with --no-verify to skip this check (not recommended). ' +
          'Alternatively, use `npm install -g hoolix` for npm-provenance-verified installs.',
        );
      }
      if (!ok) {
        await fs.remove(tmpPath).catch(() => {});
        throw new Error(
          'SHA-256 checksum mismatch — the downloaded binary does not match the expected hash. ' +
          'This could indicate a corrupted download or a tampered release. ' +
          'Run with --no-verify to skip this check.',
        );
      }
      log.success('SHA-256 checksum verified.');
    } else {
      log.warn('Checksum verification skipped (--no-verify).');
    }

    // ── Apply ────────────────────────────────────────────────────────────────
    log.info('Applying update...');

    if (process.platform === 'win32') {
      // Windows: use detached batch helper — cannot overwrite a running exe in-place
      const batPath = currentExe + '.update.bat';
      let restartPart = '';
      if (restartSlugs.length > 0) {
        restartPart = restartSlugs
          .map((slug) => `start /b "" "${currentExe}" start ${slug}`)
          .join('\r\n');
      }
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

      log.success(`Update to ${updateInfo.latestVersion} prepared — applying after exit.`);
      await new Promise((r) => setTimeout(r, 150));
      process.exit(0);
    } else {
      // Non-Windows: standard atomic rename
      if (await fs.pathExists(currentExe)) {
        await fs.rename(currentExe, backupPath).catch(() => {});
      }
      await fs.rename(tmpPath, currentExe);
      await fs.remove(backupPath).catch(() => {});

      log.success(`Updated to ${updateInfo.latestVersion}!`);
      log.warn('Restart hoolix for the update to take effect.');
      return true;
    }
  } catch (err: any) {
    log.error('Update failed:', err.message);

    if (await fs.pathExists(backupPath)) {
      try {
        await fs.rename(backupPath, currentExe);
        log.info('Rolled back to previous version.');
      } catch {}
    }
    await fs.remove(tmpPath).catch(() => {});
    if (process.platform === 'win32') {
      await fs.remove(currentExe + '.update.bat').catch(() => {});
    }
    return false;
  }
}

// ── Version comparison helpers ────────────────────────────────────────────────

/** @internal exported for unit tests */
export { compareVersions, verifyChecksum };

function parseVersion(version: string): ParsedVersion {
  const clean = version.replace(/^v/, '');
  const [core, prereleaseText = ''] = clean.split('-', 2);
  const [major = 0, minor = 0, patch = 0] = core
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  return {
    major, minor, patch,
    prerelease: prereleaseText ? prereleaseText.split('.') : [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ai = a[i]; const bi = b[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const an = Number.parseInt(ai, 10); const bn = Number.parseInt(bi, 10);
    const aiNumeric = ai === String(an);  const biNumeric = bi === String(bn);
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
  const pa = parseVersion(a); const pb = parseVersion(b);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] > pb[key]) return 1;
    if (pa[key] < pb[key]) return -1;
  }
  return comparePrerelease(pa.prerelease, pb.prerelease);
}
