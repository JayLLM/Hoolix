#!/usr/bin/env node

/**
 * Hoolix — CLI entry point and dispatcher.
 *
 * This file is intentionally thin: it boots the runtime, fires the background
 * update check, then delegates every command to its module under src/commands/.
 * Adding a new command means adding one file there and one case here.
 *
 * See AGENTS.md for architectural invariants (binary exec model, lazy imports,
 * cross-platform constraints, etc.)
 */

import { logger } from './core/logger.js';
import { ensureDirectories } from './core/paths.js';
import { loadConfig } from './core/config.js';
import { checkForUpdate } from './core/updater.js';
import { VERSION } from './core/version.js';

// Re-export for backwards compatibility (host.ts and tests may import this)
export { generateAuthKey } from './lib/auth.js';

// Static imports keep the bundler happy when building a self-contained binary.
// These modules are only executed when the corresponding __internal-* flag is present.
import { startHostedServer, type HostOptions } from './mcp/host.js';
import { startProxyHost, type ProxyHostOptions } from './mcp/proxy-host.js';
import { startGatewayHost, type GatewayHostOptions } from './mcp/gateway-host.js';

async function main() {
  const args      = process.argv.slice(2);
  const cmd       = args[0] || 'tui';
  const jsonOutput = args.includes('--json');

  await ensureDirectories();
  await loadConfig();

  // Background update check — non-blocking, best-effort, suppressed in --json mode.
  if (!jsonOutput && cmd !== 'update' && cmd !== '__internal-host' && cmd !== '__internal-proxy' && cmd !== '__internal-gateway' && cmd !== 'completion' && process.env.MCP_PORTAL_SKIP_UPDATE_CHECK !== '1') {
    checkForUpdate().then((info) => {
      if (info.isOutdated) {
        logger.warn(`A new version of hoolix is available: ${info.latestVersion} (you have ${info.currentVersion})`);
        logger.info('Run "hoolix update" to upgrade.');
      }
    }).catch(() => {});
  }

  switch (cmd) {
    // ── Meta ──────────────────────────────────────────────────────────────
    case 'version':
    case '--version':
    case '-v':
      console.log(VERSION);
      return;

    case 'help':
    case '--help':
    case '-h': {
      const { printHelp } = await import('./ui/help.js');
      printHelp();
      return;
    }

    // ── Server lifecycle ──────────────────────────────────────────────────
    case 'list': {
      const { cmdList } = await import('./commands/list.js');
      await cmdList(jsonOutput);
      return;
    }
    case 'create':
    case 'install': {
      // 'install' is sugar for 'create --template <id>' (mcp-server mental model)
      const { cmdCreate } = await import('./commands/create.js');
      await cmdCreate(args, jsonOutput);
      return;
    }
    case 'trial':
    case 'try': {
      const { cmdTrial } = await import('./commands/trial.js');
      await cmdTrial(args, jsonOutput);
      return;
    }
    case 'delete': {
      const { cmdDelete } = await import('./commands/delete.js');
      await cmdDelete(args, jsonOutput);
      return;
    }
    case 'start': {
      const { cmdStart } = await import('./commands/start.js');
      await cmdStart(args, jsonOutput);
      return;
    }
    case 'stop': {
      const { cmdStop } = await import('./commands/stop.js');
      await cmdStop(args, jsonOutput);
      return;
    }
    case 'info': {
      const { cmdInfo } = await import('./commands/info.js');
      await cmdInfo(args, jsonOutput);
      return;
    }
    case 'reindex': {
      const { cmdReindex } = await import('./commands/reindex.js');
      await cmdReindex(args, jsonOutput);
      return;
    }
    case 'verify': {
      const { cmdVerify } = await import('./commands/verify.js');
      await cmdVerify(args);
      return;
    }
    case 'templates':
    case 'template':
    case 'catalog': {
      const { cmdTemplates } = await import('./commands/templates.js');
      await cmdTemplates(args, jsonOutput);
      return;
    }

    // ── Integration ───────────────────────────────────────────────────────
    case 'connect': {
      const { cmdConnect } = await import('./commands/connect.js');
      await cmdConnect(args, jsonOutput);
      return;
    }
    case 'gateway':
    case 'gateways': {
      const { cmdGateway } = await import('./commands/gateway.js');
      await cmdGateway(args, jsonOutput);
      return;
    }
    case 'clients':
    case 'client': {
      const { cmdClients } = await import('./commands/clients.js');
      await cmdClients(args, jsonOutput);
      return;
    }
    case 'secrets':
    case 'secret': {
      const { cmdSecrets } = await import('./commands/secrets.js');
      await cmdSecrets(args, jsonOutput);
      return;
    }
    case 'profile':
    case 'profiles': {
      const { cmdProfile } = await import('./commands/profile.js');
      await cmdProfile(args, jsonOutput);
      return;
    }
    case 'approvals':
    case 'approval': {
      const { cmdApprovals } = await import('./commands/approvals.js');
      await cmdApprovals(args, jsonOutput);
      return;
    }
    case 'rotate':
    case 'rotate-key': {
      const { cmdRotateKey } = await import('./commands/rotate.js');
      await cmdRotateKey(args, jsonOutput);
      return;
    }
    case 'audit':
    case 'audit-log': {
      const { cmdAudit } = await import('./commands/audit.js');
      await cmdAudit(args);
      return;
    }
    case 'stats': {
      const { cmdStats } = await import('./commands/stats.js');
      await cmdStats(args, jsonOutput);
      return;
    }
    case 'export': {
      const { cmdExport } = await import('./commands/export.js');
      await cmdExport(args, jsonOutput);
      return;
    }
    case 'import': {
      const { cmdImport } = await import('./commands/import.js');
      await cmdImport(args, jsonOutput);
      return;
    }
    case 'bundle': {
      const { cmdBundle } = await import('./commands/bundle.js');
      await cmdBundle(args, jsonOutput);
      return;
    }

    // ── System ────────────────────────────────────────────────────────────
    case 'completion':
    case 'completions': {
      const { cmdCompletion } = await import('./commands/completion.js');
      await cmdCompletion(args);
      return;
    }

    case 'doctor': {
      const { cmdDoctor } = await import('./commands/doctor.js');
      await cmdDoctor(jsonOutput);
      return;
    }
    case 'update': {
      const { cmdUpdate } = await import('./commands/update.js');
      await cmdUpdate(args, jsonOutput);
      return;
    }
    case 'uninstall': {
      const { cmdUninstall } = await import('./commands/uninstall.js');
      await cmdUninstall(args, jsonOutput);
      return;
    }
    case 'gui':
    case 'web':
    case 'dashboard': {
      const { cmdGui } = await import('./commands/gui.js');
      await cmdGui(args);
      return;
    }

    // ── Internal host/proxy mode (binary self-spawn — never call directly) ──
    case '__internal-host':
      await runInternalHost(args);
      return;

    case '__internal-proxy':
      await runInternalProxy(args);
      return;

    case '__internal-gateway':
      await runInternalGateway(args);
      return;

    // ── TUI (default when no command given) ───────────────────────────────
    case 'tui':
    default: {
      // Probe raw-mode support before importing the TUI module.
      // This prevents failures in packaged Windows exes on certain terminals.
      let rawModeProbeOk = true;
      if (process.env.MCP_PORTAL_TUI_TEST_MODE === '1') {
        rawModeProbeOk = true;
      } else if (process.stdin.isTTY && process.stdout.isTTY) {
        try {
          (process.stdin as any).setRawMode?.(true);
          (process.stdin as any).setRawMode?.(false);
        } catch {
          rawModeProbeOk = false;
        }
      } else {
        rawModeProbeOk = false;
      }

      if (!rawModeProbeOk) {
        await launchDashboardPlaceholder();
        return;
      }

      try {
        const { launchTUI } = await import('./tui/index.js');
        await launchTUI();
      } catch (e: any) {
        logger.warn('TUI failed to launch (falling back to help):', e?.message || e);
        await launchDashboardPlaceholder();
      }
      return;
    }
  }
}

async function runInternalHost(args: string[]) {
  const getArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const slug    = getArg('slug');
  const portStr = getArg('port');
  const dataDir = getArg('data-dir');
  const authKey = getArg('auth-key');

  if (!slug || !portStr || !dataDir || !authKey) {
    console.error('Internal host mode requires --slug, --port, --data-dir, --auth-key');
    process.exit(1);
  }

  const options: HostOptions = { slug, port: parseInt(portStr, 10), dataDir, authKey };
  await startHostedServer(options);
}

async function runInternalProxy(args: string[]) {
  const getArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const slug    = getArg('slug');
  const portStr = getArg('port');
  const authKey = getArg('auth-key');

  if (!slug || !portStr || !authKey) {
    console.error('Internal proxy mode requires --slug, --port, --auth-key');
    process.exit(1);
  }

  const options: ProxyHostOptions = { slug, port: parseInt(portStr, 10), authKey };
  await startProxyHost(options);
}

async function runInternalGateway(args: string[]) {
  const getArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const slug = getArg('slug');
  const portStr = getArg('port');
  const authKey = getArg('auth-key');

  if (!slug || !portStr || !authKey) {
    console.error('Internal gateway mode requires --slug, --port, --auth-key');
    process.exit(1);
  }

  const options: GatewayHostOptions = { slug, port: parseInt(portStr, 10), authKey };
  await startGatewayHost(options);
}

async function launchDashboardPlaceholder() {
  const { printHelp } = await import('./ui/help.js');
  printHelp();
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
