/**
 * In-memory fixed-window rate limiter with periodic state persistence.
 *
 * The old pattern of reading + writing rate-state.json on every request was:
 *   (a) racy under concurrent requests (reads stale counts),
 *   (b) O(1) I/O per request in the hot path,
 *   (c) not keyed per client so a noisy client penalises all clients.
 *
 * This class keeps counters in memory, flushes to disk every FLUSH_INTERVAL_MS,
 * and loads the previous window on startup so a restart doesn't open a fresh flood
 * window. Keying is global (same as before) — per-client keying is a future improvement.
 */

import fs from 'fs-extra';

const FLUSH_INTERVAL_MS = 10_000;

export class RateLimiter {
  private reqCount = 0;
  private windowStart = Date.now();
  private flushTimer?: ReturnType<typeof setInterval>;
  private dirty = false;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly stateFile: string,
  ) {}

  /** Load persisted state and start the periodic flush timer. */
  async init(): Promise<void> {
    try {
      const state = await fs.readJson(this.stateFile);
      if (typeof state.windowStart === 'number' && typeof state.reqCount === 'number') {
        this.windowStart = state.windowStart;
        this.reqCount = state.reqCount;
      }
    } catch {
      // No prior state — start fresh.
    }

    this.flushTimer = setInterval(() => {
      if (this.dirty) this.flush().catch(() => {});
    }, FLUSH_INTERVAL_MS);
    this.flushTimer.unref?.();
  }

  /**
   * Check and increment the request counter.
   * Returns true if the request is allowed, false if the limit is exceeded.
   */
  check(): boolean {
    const now = Date.now();
    if (now - this.windowStart > this.windowMs) {
      this.reqCount = 0;
      this.windowStart = now;
    }
    this.reqCount++;
    this.dirty = true;
    return this.reqCount <= this.limit;
  }

  /** Get the number of seconds until the current window expires. */
  retryAfterSeconds(): number {
    return Math.ceil((this.windowStart + this.windowMs - Date.now()) / 1000);
  }

  /** Flush state to disk immediately (e.g. on shutdown). */
  async flush(): Promise<void> {
    await fs
      .writeJson(this.stateFile, {
        windowStart: this.windowStart,
        reqCount: this.reqCount,
        limit: this.limit,
        windowMs: this.windowMs,
      })
      .catch(() => {});
    this.dirty = false;
  }

  /** Stop the flush timer (call on shutdown). */
  stop(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }
}
