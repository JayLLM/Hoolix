import path from 'node:path';
import type { Profile } from './profiles.js';

export type PolicyDecision =
  | { effect: 'allow'; reason?: string }
  | { effect: 'deny'; reason: string }
  | { effect: 'approve'; reason: string };

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function matchesPattern(pattern: string, value: string): boolean {
  return wildcardToRegex(pattern).test(value);
}

function anyPatternMatches(patterns: string[], value: string): boolean {
  return patterns.some((pattern) => matchesPattern(pattern, value));
}

export function isWriteTool(toolName: string): boolean {
  return /(^|[._-])(create|update|write|delete|remove|send|post|push|merge|mutate|insert|edit|apply)([._-]|$)/i.test(toolName);
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach((item) => collectStrings(item, out));
  return out;
}

function normalizeFsPath(value: string): string {
  return path.resolve(value);
}

function isSubPath(candidate: string, root: string): boolean {
  const rel = path.relative(normalizeFsPath(root), normalizeFsPath(candidate));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function sandboxDecision(profile: Profile, toolName: string, args: unknown): PolicyDecision | null {
  const strings = collectStrings(args);
  const sandbox = profile.sandbox;

  if (/filesystem|file|path/i.test(toolName)) {
    for (const blocked of sandbox.blockedPaths) {
      if (strings.some((candidate) => candidate.includes(blocked) || isSubPath(candidate, blocked))) {
        return { effect: 'deny', reason: `blocked path matched "${blocked}"` };
      }
    }
    if (sandbox.filesystemRoots.length > 0) {
      const pathLike = strings.filter((candidate) => /[\\/]/.test(candidate) || /^[a-zA-Z]:/.test(candidate));
      for (const candidate of pathLike) {
        if (!sandbox.filesystemRoots.some((root) => isSubPath(candidate, root))) {
          return { effect: 'deny', reason: `path outside allowed filesystem roots: ${candidate}` };
        }
      }
    }
  }

  const urls = strings
    .map((candidate) => {
      try { return new URL(candidate); } catch { return null; }
    })
    .filter((url): url is URL => !!url);
  for (const url of urls) {
    if (sandbox.blockedDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
      return { effect: 'deny', reason: `blocked domain matched "${url.hostname}"` };
    }
    if (sandbox.allowedDomains.length > 0 && !sandbox.allowedDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
      return { effect: 'deny', reason: `domain outside allowed list: ${url.hostname}` };
    }
  }
  return null;
}

export function evaluatePolicy(input: {
  profile: Profile | null;
  gateway: string;
  toolName: string;
  args: unknown;
}): PolicyDecision {
  const { profile, gateway, toolName, args } = input;
  if (!profile) return { effect: 'allow', reason: 'no profile' };

  if (profile.allowedGateways.length > 0 && !profile.allowedGateways.includes(gateway)) {
    return { effect: 'deny', reason: `profile "${profile.slug}" cannot access gateway "${gateway}"` };
  }

  if (profile.allowedTools.length > 0 && !anyPatternMatches(profile.allowedTools, toolName)) {
    return { effect: 'deny', reason: `profile "${profile.slug}" cannot access tool "${toolName}"` };
  }

  const sandbox = sandboxDecision(profile, toolName, args);
  if (sandbox) return sandbox;

  for (const rule of profile.policy.rules) {
    if (matchesPattern(rule.match, toolName)) {
      return { effect: rule.effect, reason: `matched rule ${rule.match}` };
    }
  }

  if (profile.approvalMode === 'always') return { effect: 'approve', reason: 'profile requires approval for every tool' };
  if (profile.approvalMode === 'read-only' && isWriteTool(toolName)) return { effect: 'deny', reason: 'profile is read-only' };
  if (profile.approvalMode === 'writes' && isWriteTool(toolName)) return { effect: 'approve', reason: 'profile requires approval for writes' };

  return { effect: profile.policy.defaultEffect, reason: 'default policy' };
}
