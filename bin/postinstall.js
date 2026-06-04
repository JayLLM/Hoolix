#!/usr/bin/env node
/**
 * Postinstall hint — shown once after `npm install -g hoolix`.
 *
 * Intentionally plain CJS with no imports so it runs on any Node ≥ 14 without
 * compilation or ESM resolution. The script always exits 0.
 *
 * Skips output when:
 *   - Running in CI (CI=1)
 *   - Explicitly suppressed (HOOLIX_NO_POSTINSTALL=1)
 *   - stdout is not a TTY (piped / scripted install)
 *   - The install looks like a local dev install (no npm_config_global set
 *     and node_modules/.bin/tsx exists next to us, indicating a dev checkout)
 */

'use strict';

// Always exit 0 — postinstall must never fail or block the install.
process.on('uncaughtException', () => process.exit(0));

(function run() {
  // Skip in CI or when explicitly suppressed
  if (process.env.CI || process.env.HOOLIX_NO_POSTINSTALL === '1') return;

  // Skip when output is not a terminal (e.g. npm install piped into a script)
  if (!process.stdout.isTTY) return;

  // Skip if this looks like a dev checkout: check for the presence of src/
  // (i.e. we're running postinstall because someone ran `npm install` in the repo)
  const path = require('node:path');
  const fs   = require('node:fs');
  const dir  = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(dir, 'src', 'index.ts'))) return;

  const c = {
    cyan:  '\x1b[36m',
    green: '\x1b[32m',
    yellow:'\x1b[33m',
    bold:  '\x1b[1m',
    dim:   '\x1b[2m',
    reset: '\x1b[0m',
  };

  process.stdout.write([
    '',
    `  ${c.cyan}${c.bold}◆ hoolix installed!${c.reset}`,
    '',
    `  ${c.green}✓${c.reset} Run ${c.cyan}hoolix doctor${c.reset} to verify your installation.`,
    `  ${c.green}✓${c.reset} Run ${c.cyan}hoolix templates list${c.reset} to browse 15 official templates.`,
    `  ${c.green}✓${c.reset} Run ${c.cyan}hoolix install filesystem /path/to/project --yes${c.reset} to get started.`,
    '',
    `  ${c.yellow}Shell completions:${c.reset}`,
    `  ${c.dim}bash:${c.reset}        eval "$(hoolix completion bash)"`,
    `  ${c.dim}zsh:${c.reset}         eval "$(hoolix completion zsh)"`,
    `  ${c.dim}fish:${c.reset}        hoolix completion fish | source`,
    `  ${c.dim}powershell:${c.reset}  hoolix completion powershell | Invoke-Expression`,
    '',
    `  ${c.dim}Full docs: https://github.com/JayLLM/hoolix${c.reset}`,
    '',
  ].join('\n'));
}());
