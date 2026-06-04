import chalk from 'chalk';

export const ui = {
  brand:   chalk.hex('#7dd3fc').bold('hoolix'),
  accent:  chalk.hex('#7dd3fc'),
  success: chalk.hex('#34d399'),
  warning: chalk.hex('#fbbf24'),
  danger:  chalk.hex('#fb7185'),
  muted:   chalk.dim,
};

export type DetailRow = [label: string, value: string | number | boolean | undefined];
export type TableRow  = Record<string, string | number>;

export function printTitle(title: string, subtitle?: string): void {
  console.log('');
  console.log(`${ui.accent('◆')} ${ui.brand} ${chalk.bold(title)}`);
  if (subtitle) console.log(`  ${ui.muted(subtitle)}`);
  console.log('');
}

export function printSection(title: string): void {
  console.log(`  ${chalk.bold(title)}`);
}

export function printDetails(rows: DetailRow[]): void {
  const visible = rows.filter(([, v]) => v !== undefined && v !== '');
  const labelWidth = Math.max(0, ...visible.map(([l]) => l.length));
  for (const [label, value] of visible) {
    console.log(`  ${ui.muted(label.padEnd(labelWidth))}  ${value}`);
  }
}

export function printCommand(command: string): void {
  console.log(`  ${ui.accent('›')} ${chalk.cyan(command)}`);
}

export function printTable(rows: TableRow[]): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) =>
    Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length))
  );
  const renderRow = (row: Record<string, string | number>, color = (v: string) => v) =>
    `  ${headers.map((h, i) => color(String(row[h] ?? '').padEnd(widths[i]))).join('  ')}`;
  console.log(renderRow(Object.fromEntries(headers.map((h) => [h, h])), chalk.bold));
  console.log(`  ${widths.map((w) => ui.muted('─'.repeat(w))).join('  ')}`);
  for (const row of rows) console.log(renderRow(row));
}

export function truncate(value: string, max = 54): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function maskSecret(value: string, visible = 6): string {
  if (!value) return '';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function statusText(ok: boolean, positive = 'ok', negative = 'issue'): string {
  return ok ? ui.success(positive) : ui.danger(negative);
}

export function parseOption(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

export function getFreshness(lastUpdatedAt: string): {
  ageDays: number;
  status: 'fresh' | 'aging' | 'stale';
  message: string;
} {
  const updated = Date.parse(lastUpdatedAt);
  const ageDays = Number.isFinite(updated)
    ? Math.max(0, Math.floor((Date.now() - updated) / (24 * 60 * 60 * 1000)))
    : 9999;
  const status = ageDays >= 30 ? 'stale' : ageDays >= 14 ? 'aging' : 'fresh';
  return {
    ageDays,
    status,
    message:
      status === 'fresh'
        ? `${ageDays}d old`
        : `${ageDays}d old - run reindex if source changed`,
  };
}
