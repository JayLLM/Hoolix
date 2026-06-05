/**
 * Append-only audit logger with in-memory line counting and atomic rotation.
 *
 * The previous pattern re-read the entire audit.log on every write to check if
 * rotation was needed. This class:
 *   - Tracks line count in memory (loaded once on init)
 *   - Rotates only when the threshold is actually exceeded
 *   - Uses write-to-tmp then rename for atomic rotation (prevents partial reads)
 */

import fs from 'fs-extra';

const DEFAULT_MAX_LINES = 5_000;
const DEFAULT_KEEP_RATIO = 0.8; // keep last 80% on rotation

export class AuditLogger {
  private lineCount = 0;

  constructor(
    private readonly filePath: string,
    private readonly maxLines = DEFAULT_MAX_LINES,
    private readonly keepRatio = DEFAULT_KEEP_RATIO,
  ) {}

  /** Count existing lines on startup so the threshold is respected across restarts. */
  async init(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      this.lineCount = content.split('\n').filter(Boolean).length;
    } catch {
      this.lineCount = 0;
    }
  }

  /** Append a structured audit entry. Rotates if the line threshold is exceeded. */
  async write(tool: string, details: Record<string, unknown>): Promise<void> {
    try {
      const line = JSON.stringify({ ts: new Date().toISOString(), tool, ...details }) + '\n';
      await fs.appendFile(this.filePath, line).catch(() => {});
      this.lineCount++;

      if (this.lineCount > this.maxLines) {
        await this.rotate();
      }
    } catch {
      // Audit failures must never crash the host.
    }
  }

  private async rotate(): Promise<void> {
    const tmpPath = this.filePath + '.tmp';
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const keepCount = Math.floor(this.maxLines * this.keepRatio);
      const kept = lines.slice(-keepCount);
      await fs.writeFile(tmpPath, kept.join('\n') + '\n');
      await fs.rename(tmpPath, this.filePath);
      this.lineCount = kept.length;
    } catch {
      await fs.remove(tmpPath).catch(() => {});
    }
  }
}
