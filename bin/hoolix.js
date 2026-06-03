#!/usr/bin/env node

// Bin shim: prefers compiled dist/index.js; falls back to tsx + src/index.ts for development.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = join(__dirname, '..', 'dist', 'index.js');
const srcEntry = join(__dirname, '..', 'src', 'index.ts');

if (existsSync(distEntry)) {
  // Production: run compiled JS
  const { status } = spawnSync(process.execPath, [distEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(status ?? 1);
} else {
  // Dev: use tsx (must be installed)
  const tsx = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
  if (!existsSync(tsx)) {
    console.error('Development mode requires tsx. Run: npm install');
    process.exit(1);
  }
  const { status } = spawnSync(tsx, [srcEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(status ?? 1);
}
