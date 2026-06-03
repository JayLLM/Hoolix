import { createConsola } from 'consola';

export const logger = createConsola({
  level: process.env.MCP_PORTAL_LOG_LEVEL === 'debug' ? 4 : 3,
  fancy: true,
  formatOptions: {
    colors: true,
    date: false,
    compact: false,
  },
});

export const log = logger;
