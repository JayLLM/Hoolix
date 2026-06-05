#!/usr/bin/env node

/**
 * Hoolix CLI — npm global package entry point.
 *
 * Production path (dist/index.js exists after `npm install -g hoolix`):
 *   Loads compiled JS via dynamic import *in the same process*.
 *   This gives correct signal handling (Ctrl+C in TUI), faster startup,
 *   and avoids the subprocess overhead of the old spawnSync approach.
 *
 * Development path (dist/ absent, src/ present):
 *   Falls back to tsx via spawnSync for TypeScript source execution.
 *
 * Note: this file is intentionally plain JS (not TS) so it runs without
 * any compilation step. It uses top-level await which requires Node ≥ 14.8
 * and ESM ("type":"module" in package.json).
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = join(__dirname, '..', 'dist', 'index.js');
const srcEntry  = join(__dirname, '..', 'src', 'index.ts');

function toImportSpecifier(filePath) {
  // Windows absolute paths like C:\...\dist\index.js are parsed by ESM import()
  // as an unsupported "c:" URL scheme. Convert filesystem paths to file:// URLs
  // before dynamic import while keeping the same-process npm startup path.
  return pathToFileURL(filePath).href;
}

if (existsSync(distEntry)) {
  // ── Production / npm global install ──────────────────────────────────────
  // Import compiled JS directly into this process. process.argv is already set
  // correctly (node bins/hoolix.js [...args]), so src/index.ts reads args normally.
  // Signals (SIGTERM, SIGINT/Ctrl+C, etc.) are handled by src/index.ts directly
  // without needing to propagate through a subprocess.
  await import(toImportSpecifier(distEntry));
} else {
  // ── Development fallback ──────────────────────────────────────────────────
  // dist/ not built — use tsx to run TypeScript source directly.
  const { spawnSync } = await import('node:child_process');

  const tsxBase = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
  const tsxCmd = process.platform === 'win32' ? `${tsxBase}.cmd` : tsxBase;
  const tsx = existsSync(tsxCmd) ? tsxCmd : tsxBase;
  if (!existsSync(tsx)) {
    console.error('[hoolix] Development mode requires tsx. Run: npm install');
    process.exit(1);
  }

  const { status } = spawnSync(tsx, [srcEntry, ...process.argv.slice(2)], {
    stdio:  'inherit',
    env:    process.env,
    shell:  process.platform === 'win32',
  });
  process.exit(status ?? 1);
}
