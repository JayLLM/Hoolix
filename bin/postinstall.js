#!/usr/bin/env node
/**
 * Postinstall hint — shown once after `npm install -g hoolix`.
 * Kept minimal: no dependencies, no ESM, plain CJS so it runs in any Node ≥ 14.
 * Errors are silently swallowed (package.json: "postinstall": "... || true").
 */

// Skip in CI or when piped (not a TTY) to avoid noisy automated installs.
if (process.env.CI || process.env.HOOLIX_NO_POSTINSTALL || !process.stdout.isTTY) {
  process.exit(0);
}

const c = {
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  bold:   '\x1b[1m',
  reset:  '\x1b[0m',
};

process.stdout.write(`
${c.cyan}${c.bold}◆ hoolix 1.0.0 installed!${c.reset}

  ${c.green}✓${c.reset} Run ${c.cyan}hoolix doctor${c.reset} to verify your installation.
  ${c.green}✓${c.reset} Run ${c.cyan}hoolix templates list${c.reset} to browse 14 official templates.
  ${c.green}✓${c.reset} Run ${c.cyan}hoolix install filesystem /path/to/project --yes${c.reset} to get started.

  ${c.yellow}Shell completions:${c.reset}
    bash:        eval "$(hoolix completion bash)"
    zsh:         eval "$(hoolix completion zsh)"
    fish:        hoolix completion fish | source
    powershell:  hoolix completion powershell | Invoke-Expression

  Full docs: https://github.com/JayLLM/hoolix
`);
