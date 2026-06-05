import { z } from 'zod';
import fs from 'fs-extra';
import { getApprovalsPath, ensureDirectories } from './paths.js';

export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'denied', 'consumed']);

export const ApprovalRecordSchema = z.object({
  id: z.string(),
  status: ApprovalStatusSchema,
  gateway: z.string(),
  profile: z.string(),
  toolName: z.string(),
  backend: z.string().optional(),
  argumentsPreview: z.string(),
  argumentsHash: z.string(),
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().optional(),
});

export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

export interface ApprovalStore {
  version: string;
  approvals: ApprovalRecord[];
}

async function loadStore(): Promise<ApprovalStore> {
  await ensureDirectories();
  const path = getApprovalsPath();
  if (!(await fs.pathExists(path))) {
    const fresh: ApprovalStore = { version: '1.0.0', approvals: [] };
    await fs.writeJson(path, fresh, { spaces: 2 });
    return fresh;
  }
  const raw = await fs.readJson(path);
  const approvals = z.array(ApprovalRecordSchema).parse(raw.approvals ?? []);
  return { version: String(raw.version ?? '1.0.0'), approvals };
}

async function saveStore(store: ApprovalStore): Promise<void> {
  await fs.writeJson(getApprovalsPath(), store, { spaces: 2 });
}

export async function listApprovals(status?: ApprovalRecord['status']): Promise<ApprovalRecord[]> {
  const store = await loadStore();
  const approvals = status ? store.approvals.filter((approval) => approval.status === status) : store.approvals;
  return approvals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listPendingApprovals(): Promise<ApprovalRecord[]> {
  return listApprovals('pending');
}

export async function queueApproval(input: {
  gateway: string;
  profile: string;
  toolName: string;
  backend?: string;
  argumentsPreview: string;
  argumentsHash: string;
}): Promise<ApprovalRecord> {
  const store = await loadStore();
  const existing = store.approvals.find((approval) =>
    approval.status === 'pending' &&
    approval.gateway === input.gateway &&
    approval.profile === input.profile &&
    approval.toolName === input.toolName &&
    approval.argumentsHash === input.argumentsHash
  );
  if (existing) return existing;

  const record: ApprovalRecord = {
    id: `appr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'pending',
    gateway: input.gateway,
    profile: input.profile,
    toolName: input.toolName,
    backend: input.backend,
    argumentsPreview: input.argumentsPreview,
    argumentsHash: input.argumentsHash,
    createdAt: new Date().toISOString(),
  };
  store.approvals.push(record);
  await saveStore(store);
  return record;
}

export async function decideApproval(id: string, status: 'approved' | 'denied'): Promise<ApprovalRecord> {
  const store = await loadStore();
  const record = store.approvals.find((approval) => approval.id === id);
  if (!record) throw new Error(`Approval "${id}" not found. Next: run hoolix approvals list.`);
  record.status = status;
  record.decidedAt = new Date().toISOString();
  await saveStore(store);
  return record;
}

export async function consumeMatchingApproval(input: {
  gateway: string;
  profile: string;
  toolName: string;
  argumentsHash: string;
}): Promise<ApprovalRecord | null> {
  const store = await loadStore();
  const record = store.approvals.find((approval) =>
    approval.status === 'approved' &&
    approval.gateway === input.gateway &&
    approval.profile === input.profile &&
    approval.toolName === input.toolName &&
    approval.argumentsHash === input.argumentsHash
  );
  if (!record) return null;
  record.status = 'consumed';
  record.decidedAt = new Date().toISOString();
  await saveStore(store);
  return record;
}

export async function findDeniedMatchingApproval(input: {
  gateway: string;
  profile: string;
  toolName: string;
  argumentsHash: string;
}): Promise<ApprovalRecord | null> {
  const store = await loadStore();
  return store.approvals.find((approval) =>
    approval.status === 'denied' &&
    approval.gateway === input.gateway &&
    approval.profile === input.profile &&
    approval.toolName === input.toolName &&
    approval.argumentsHash === input.argumentsHash
  ) ?? null;
}

export function previewArgs(value: unknown): string {
  const json = JSON.stringify(value ?? {});
  return json.length > 500 ? `${json.slice(0, 500)}...` : json;
}

export async function hashArgs(value: unknown): Promise<string> {
  const crypto = await import('node:crypto');
  return crypto.createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex');
}
