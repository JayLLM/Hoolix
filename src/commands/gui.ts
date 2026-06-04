import { logger } from '../core/logger.js';

export async function cmdGui(args: string[]): Promise<void> {
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : 8080;
  const bindIdx = args.indexOf('--bind');
  const host = bindIdx !== -1 && args[bindIdx + 1] ? args[bindIdx + 1] : '127.0.0.1';
  const noOpen = args.includes('--no-open') || args.includes('--no-browser');
  const tokenIdx = args.indexOf('--token');
  const providedToken = tokenIdx !== -1 && args[tokenIdx + 1] ? args[tokenIdx + 1] : undefined;

  try {
    const { launchWebGui } = await import('../web/server.js');
    await launchWebGui({ port, host, open: !noOpen, token: providedToken, strictPort: portIdx !== -1 });
  } catch (e: any) {
    logger.error('Failed to launch web GUI:', e?.message || e);
    process.exit(1);
  }
}
