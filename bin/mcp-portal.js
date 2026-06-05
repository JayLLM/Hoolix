#!/usr/bin/env node

console.warn('Deprecated: `mcp-portal` has been renamed. Please use the `hoolix` binary instead.');
try {
  // Try to exec the new binary if present
  const { spawnSync } = require('child_process');
  const result = spawnSync('hoolix', process.argv.slice(2), { stdio: 'inherit' });
  process.exit(result.status ?? 1);
} catch (e) {
  console.error('`hoolix` binary not found in PATH. Install Hoolix with npm or the installer scripts, then run `hoolix`.');
  process.exit(1);
}
