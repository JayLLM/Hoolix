import { decideApproval, listApprovals, listPendingApprovals } from '../core/approvals.js';
import { logger } from '../core/logger.js';
import { printTitle, printCommand, printJson, printTable, ui } from '../ui/format.js';

export async function cmdApprovals(args: string[], json: boolean): Promise<void> {
  const sub = args[1] || 'list';

  if (sub === 'list') {
    const all = args.includes('--all');
    const approvals = all ? await listApprovals() : await listPendingApprovals();
    if (json) {
      printJson(approvals);
      return;
    }
    if (approvals.length === 0) {
      printTitle('Approvals', all ? 'No approval records yet.' : 'No pending approvals.');
      printCommand('hoolix approvals list --all');
      return;
    }
    printTitle('Approvals', all ? `${approvals.length} approval record(s)` : `${approvals.length} pending approval(s)`);
    printTable(approvals.map((approval) => ({
      ID: approval.id,
      Status: approval.status,
      Profile: approval.profile,
      Gateway: approval.gateway,
      Tool: approval.toolName,
      Args: approval.argumentsPreview.slice(0, 44),
      Created: approval.createdAt.slice(0, 19),
    })));
    console.log('');
    console.log(`  ${ui.muted('Approve:')} hoolix approvals approve <id>`);
    console.log(`  ${ui.muted('Deny:')}    hoolix approvals deny <id>`);
    return;
  }

  if (sub === 'approve' || sub === 'deny') {
    const id = args[2];
    if (!id) {
      if (json) printJson({ ok: false, error: `Missing approval id. Next: hoolix approvals ${sub} <id>.` });
      else logger.error(`Usage: hoolix approvals ${sub} <id>`);
      process.exit(1);
    }
    try {
      const approval = await decideApproval(id, sub === 'approve' ? 'approved' : 'denied');
      if (json) printJson({ ok: true, approval });
      else logger.success(`${sub === 'approve' ? 'Approved' : 'Denied'} ${id}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (json) printJson({ ok: false, error: message });
      else logger.error(message);
      process.exit(1);
    }
    return;
  }

  if (json) printJson({ ok: false, error: `Unknown approvals command "${sub}". Next: use list, approve, or deny.` });
  else logger.error(`Unknown approvals command "${sub}". Next: run hoolix approvals list.`);
  process.exit(1);
}
