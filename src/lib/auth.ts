import { randomBytes, timingSafeEqual } from 'node:crypto';

export function generateAuthKey(): string {
  // Cryptographically secure; prefixed for easy identification in auth headers.
  return 'mcp_' + randomBytes(24).toString('hex');
}

/**
 * Constant-time string equality to prevent timing-based token extraction.
 * Pads the longer side is irrelevant — length mismatch is caught before comparison
 * and a dummy equal-length comparison is run so the branch itself doesn't leak timing.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) {
      timingSafeEqual(aBuf, aBuf); // dummy same-length compare to normalise timing
      return false;
    }
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}
