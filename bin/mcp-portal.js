#!/usr/bin/env node

console.warn('Deprecated: Please use the `hoolix` binary instead of `hoolix`.');
try {
  // Try to exec the new binary if present
  const { spawnSync } = require('child_process');
  const result = spawnSync('hoolix', process.argv.slice(2), { stdio: 'inherit' });
  process.exit(result.status ?? 1);
} catch (e) {
  console.error('`hoolix` binary not found in PATH. Install using the installer scripts or run `npm run build` and use the dist binary.');
  process.exit(1);
}
