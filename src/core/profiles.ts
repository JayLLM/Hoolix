import { z } from 'zod';
import fs from 'fs-extra';
import path from 'node:path';
import { ensureDirectories, getPaths, getProfileConfigPath, getProfileDir } from './paths.js';
import { slugify } from './registry.js';
import { generateAuthKey, timingSafeEqualString } from '../lib/auth.js';

export const PolicyRuleSchema = z.object({
  match: z.string().min(1),
  effect: z.enum(['allow', 'deny', 'approve']),
});

export const SandboxSchema = z.object({
  filesystemRoots: z.array(z.string()).default([]),
  blockedPaths: z.array(z.string()).default([]),
  allowedDomains: z.array(z.string()).default([]),
  blockedDomains: z.array(z.string()).default([]),
});

export const ProfileSchema = z.object({
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/),
  authKey: z.string().min(16),
  allowedGateways: z.array(z.string()).default([]),
  allowedTools: z.array(z.string()).default(['*']),
  approvalMode: z.enum(['read-only', 'writes', 'always']).default('writes'),
  policy: z.object({
    defaultEffect: z.enum(['allow', 'deny', 'approve']).default('allow'),
    rules: z.array(PolicyRuleSchema).default([]),
  }),
  sandbox: SandboxSchema.default({ filesystemRoots: [], blockedPaths: [], allowedDomains: [], blockedDomains: [] }),
  createdAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime(),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type Profile = z.infer<typeof ProfileSchema>;

const PROFILE_INDEX_FILE = 'profiles.json';

interface ProfileIndex {
  version: string;
  profiles: Record<string, { slug: string; path: string }>;
}

function profileIndexPath(): string {
  return path.join(getPaths().data, PROFILE_INDEX_FILE);
}

async function loadProfileIndex(): Promise<ProfileIndex> {
  await ensureDirectories();
  const indexPath = profileIndexPath();
  if (!(await fs.pathExists(indexPath))) {
    const fresh: ProfileIndex = { version: '1.0.0', profiles: {} };
    await fs.writeJson(indexPath, fresh, { spaces: 2 });
    return fresh;
  }
  return fs.readJson(indexPath) as Promise<ProfileIndex>;
}

async function saveProfileIndex(index: ProfileIndex): Promise<void> {
  await fs.writeJson(profileIndexPath(), index, { spaces: 2 });
}

export function expandIncludes(includes: string[]): string[] {
  const result: string[] = [];
  for (const include of includes) {
    for (const part of include.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      result.push(trimmed.includes('*') || trimmed.includes('.') ? trimmed : `${slugify(trimmed)}.*`);
    }
  }
  return [...new Set(result)];
}

function defaultRules(approvalMode: Profile['approvalMode']): PolicyRule[] {
  if (approvalMode === 'always') return [{ match: '*', effect: 'approve' }];
  if (approvalMode === 'read-only') {
    return [
      { match: '*.create*', effect: 'deny' },
      { match: '*.update*', effect: 'deny' },
      { match: '*.write*', effect: 'deny' },
      { match: '*.delete*', effect: 'deny' },
      { match: '*.remove*', effect: 'deny' },
      { match: '*.send*', effect: 'deny' },
      { match: '*.post*', effect: 'deny' },
    ];
  }
  return [
    { match: '*.create*', effect: 'approve' },
    { match: '*.update*', effect: 'approve' },
    { match: '*.write*', effect: 'approve' },
    { match: '*.delete*', effect: 'approve' },
    { match: '*.remove*', effect: 'approve' },
    { match: '*.send*', effect: 'approve' },
    { match: '*.post*', effect: 'approve' },
    { match: 'github.create_pull_request', effect: 'approve' },
  ];
}

export async function createProfile(options: {
  name: string;
  includes?: string[];
  gateways?: string[];
  approvalMode?: Profile['approvalMode'];
  sandbox?: Partial<Profile['sandbox']>;
}): Promise<Profile> {
  const slug = slugify(options.name);
  const index = await loadProfileIndex();
  if (index.profiles[slug]) {
    throw new Error(`Profile "${slug}" already exists. Next: run hoolix profile edit ${slug}.`);
  }
  const now = new Date().toISOString();
  const approvalMode = options.approvalMode ?? 'writes';
  const profile: Profile = {
    name: options.name,
    slug,
    authKey: generateAuthKey(),
    allowedGateways: [...new Set((options.gateways ?? []).map(slugify).filter(Boolean))],
    allowedTools: expandIncludes(options.includes?.length ? options.includes : ['*']),
    approvalMode,
    policy: { defaultEffect: 'allow', rules: defaultRules(approvalMode) },
    sandbox: {
      filesystemRoots: options.sandbox?.filesystemRoots ?? [],
      blockedPaths: options.sandbox?.blockedPaths ?? [],
      allowedDomains: options.sandbox?.allowedDomains ?? [],
      blockedDomains: options.sandbox?.blockedDomains ?? [],
    },
    createdAt: now,
    lastUpdatedAt: now,
  };
  await fs.ensureDir(getProfileDir(slug));
  await fs.writeJson(getProfileConfigPath(slug), profile, { spaces: 2 });
  index.profiles[slug] = { slug, path: getProfileDir(slug) };
  await saveProfileIndex(index);
  return profile;
}

export async function getProfile(slug: string): Promise<Profile> {
  const normalized = slugify(slug);
  const pathToConfig = getProfileConfigPath(normalized);
  if (!(await fs.pathExists(pathToConfig))) {
    throw new Error(`Profile "${slug}" not found. Next: run hoolix profile list.`);
  }
  return ProfileSchema.parse(await fs.readJson(pathToConfig));
}

export async function findProfileByAuthKey(authKey: string): Promise<Profile | null> {
  const profiles = await listProfiles();
  return profiles.find((profile) => timingSafeEqualString(profile.authKey, authKey)) ?? null;
}

export async function listProfiles(): Promise<Profile[]> {
  const index = await loadProfileIndex();
  const profiles: Profile[] = [];
  for (const { slug } of Object.values(index.profiles)) {
    try {
      profiles.push(await getProfile(slug));
    } catch {}
  }
  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const next = ProfileSchema.parse({ ...profile, lastUpdatedAt: new Date().toISOString() });
  await fs.ensureDir(getProfileDir(next.slug));
  await fs.writeJson(getProfileConfigPath(next.slug), next, { spaces: 2 });
  const index = await loadProfileIndex();
  index.profiles[next.slug] = { slug: next.slug, path: getProfileDir(next.slug) };
  await saveProfileIndex(index);
  return next;
}

export async function deleteProfile(slug: string): Promise<void> {
  const normalized = slugify(slug);
  const index = await loadProfileIndex();
  delete index.profiles[normalized];
  await saveProfileIndex(index);
  await fs.remove(getProfileDir(normalized)).catch(() => {});
}

export function maskProfile(profile: Profile): Omit<Profile, 'authKey'> & { authKey: string } {
  return { ...profile, authKey: `${profile.authKey.slice(0, 10)}...${profile.authKey.slice(-6)}` };
}
