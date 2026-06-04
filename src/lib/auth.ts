import { randomBytes } from 'node:crypto';

export function generateAuthKey(): string {
  // Cryptographically secure; prefixed for easy identification in auth headers.
  return 'mcp_' + randomBytes(24).toString('hex');
}
