import { describe, expect, it } from 'vitest';
import net from 'node:net';
import { resolveGuiPort } from '../src/web/server.js';
import { buildDashboardHtml } from '../src/web/assets.js';

async function holdPort(host = '127.0.0.1'): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not allocate test port');
  }
  return {
    port: address.port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('Web GUI port resolution', () => {
  it('selects the next free port when the default port is occupied', async () => {
    const held = await holdPort();
    try {
      const resolved = await resolveGuiPort('127.0.0.1', held.port, false);
      expect(resolved).toBeGreaterThan(held.port);
    } finally {
      await held.close();
    }
  });

  it('throws an actionable error when a strict explicit port is occupied', async () => {
    const held = await holdPort();
    try {
      await expect(resolveGuiPort('127.0.0.1', held.port, true)).rejects.toThrow('hoolix gui --port');
    } finally {
      await held.close();
    }
  });

  it('serves bundled GUI assets without CDN dependencies', () => {
    const html = buildDashboardHtml('');
    expect(html).not.toContain('cdn.tailwindcss.com');
    expect(html).not.toContain('cdnjs.cloudflare.com');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).toContain('function refreshServers');
  });
});
