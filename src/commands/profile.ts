import { createProfile, deleteProfile, getProfile, listProfiles, maskProfile, saveProfile, expandIncludes, type Profile } from '../core/profiles.js';
import { logger } from '../core/logger.js';
import { printTitle, printSection, printDetails, printCommand, printJson, printTable } from '../ui/format.js';

function valuesFor(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

function valueFor(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function parseApproval(value: string | undefined): Profile['approvalMode'] {
  if (value === 'read-only') return value;
  if (value === 'always' || value === 'always-approve') return 'always';
  return 'writes';
}

function splitCsv(values: string[]): string[] {
  return values.flatMap((value) => value.split(',').map((part) => part.trim()).filter(Boolean));
}

function parseRules(values: string[]): Array<{ match: string; effect: 'allow' | 'deny' | 'approve' }> {
  return splitCsv(values).map((value) => {
    const [match, effectRaw] = value.includes('=')
      ? value.split('=', 2)
      : value.split(':', 2);
    const effect: 'allow' | 'deny' | 'approve' = effectRaw === 'deny' || effectRaw === 'approve' ? effectRaw : 'allow';
    return { match: match.trim(), effect };
  }).filter((rule) => rule.match);
}

function parseSandbox(args: string[]): Partial<Profile['sandbox']> {
  return {
    filesystemRoots: splitCsv(valuesFor(args, '--fs-root')),
    blockedPaths: splitCsv(valuesFor(args, '--block-path')),
    allowedDomains: splitCsv(valuesFor(args, '--allow-domain')),
    blockedDomains: splitCsv(valuesFor(args, '--block-domain')),
  };
}

export async function cmdProfile(args: string[], json: boolean): Promise<void> {
  const sub = args[1] || 'list';

  if (sub === 'create') {
    const name = args[2];
    if (!name) {
      if (json) printJson({ ok: false, error: 'Missing profile name. Next: hoolix profile create codex --include github,filesystem --approval writes.' });
      else logger.error('Usage: hoolix profile create <name> --include github,filesystem --approval writes');
      process.exit(1);
    }

    try {
      const profile = await createProfile({
        name,
        includes: splitCsv(valuesFor(args, '--include')),
        gateways: splitCsv(valuesFor(args, '--gateway')),
        approvalMode: parseApproval(valueFor(args, '--approval')),
        sandbox: parseSandbox(args),
      });
      const rules = parseRules(valuesFor(args, '--rule'));
      const saved = rules.length > 0 ? await saveProfile({ ...profile, policy: { ...profile.policy, rules: [...profile.policy.rules, ...rules] } }) : profile;
      if (json) {
        printJson({ ok: true, profile: maskProfile(saved), next: [`hoolix gateway connect <gateway> --client codex --profile ${saved.slug}`] });
        return;
      }
      printTitle('Profile created', `"${saved.name}" will identify one MCP client or agent.`);
      printDetails([
        ['Slug', saved.slug],
        ['Allowed tools', saved.allowedTools.join(', ')],
        ['Gateways', saved.allowedGateways.length ? saved.allowedGateways.join(', ') : 'any'],
        ['Approval', saved.approvalMode],
        ['Rules', String(saved.policy.rules.length)],
      ]);
      console.log('');
      printSection('Next steps');
      printCommand(`hoolix gateway connect my-tools --client codex --profile ${saved.slug}`);
      printCommand('hoolix approvals list');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (json) printJson({ ok: false, error: message });
      else logger.error(message);
      process.exit(1);
    }
    return;
  }

  if (sub === 'list') {
    const profiles = await listProfiles();
    if (json) {
      printJson(profiles.map(maskProfile));
      return;
    }
    if (profiles.length === 0) {
      printTitle('Profiles', 'No client profiles yet.');
      printCommand('hoolix profile create codex --include github,filesystem --approval writes');
      return;
    }
    printTitle('Profiles', `${profiles.length} profile${profiles.length === 1 ? '' : 's'}`);
    printTable(profiles.map((profile) => ({
      Name: profile.name,
      Slug: profile.slug,
      Approval: profile.approvalMode,
      Tools: profile.allowedTools.join(', '),
      Gateways: profile.allowedGateways.length ? profile.allowedGateways.join(', ') : 'any',
      Rules: String(profile.policy.rules.length),
    })));
    return;
  }

  if (sub === 'edit') {
    const slug = args[2];
    if (!slug) {
      if (json) printJson({ ok: false, error: 'Missing profile name. Next: hoolix profile edit codex --approval always.' });
      else logger.error('Usage: hoolix profile edit <name> [--include ...] [--approval ...] [--rule pattern=effect]');
      process.exit(1);
    }
    const current = await getProfile(slug);
    const includes = splitCsv(valuesFor(args, '--include'));
    const gateways = splitCsv(valuesFor(args, '--gateway'));
    const rules = parseRules(valuesFor(args, '--rule'));
    const approval = valueFor(args, '--approval');
    const sandbox = parseSandbox(args);
    const updated = await saveProfile({
      ...current,
      allowedTools: includes.length ? expandIncludes(includes) : current.allowedTools,
      allowedGateways: gateways.length ? gateways : current.allowedGateways,
      approvalMode: approval ? parseApproval(approval) : current.approvalMode,
      policy: rules.length ? { ...current.policy, rules: [...current.policy.rules, ...rules] } : current.policy,
      sandbox: {
        filesystemRoots: sandbox.filesystemRoots?.length ? sandbox.filesystemRoots : current.sandbox.filesystemRoots,
        blockedPaths: sandbox.blockedPaths?.length ? sandbox.blockedPaths : current.sandbox.blockedPaths,
        allowedDomains: sandbox.allowedDomains?.length ? sandbox.allowedDomains : current.sandbox.allowedDomains,
        blockedDomains: sandbox.blockedDomains?.length ? sandbox.blockedDomains : current.sandbox.blockedDomains,
      },
    });
    if (json) printJson({ ok: true, profile: maskProfile(updated) });
    else logger.success(`Updated profile ${updated.slug}`);
    return;
  }

  if (sub === 'delete') {
    const slug = args[2];
    if (!slug) {
      if (json) printJson({ ok: false, error: 'Missing profile name. Next: hoolix profile delete codex.' });
      else logger.error('Usage: hoolix profile delete <name>');
      process.exit(1);
    }
    await deleteProfile(slug);
    if (json) printJson({ ok: true, profile: slug, deleted: true });
    else logger.success(`Deleted profile ${slug}`);
    return;
  }

  if (json) printJson({ ok: false, error: `Unknown profile command "${sub}". Next: use create, list, edit, or delete.` });
  else logger.error(`Unknown profile command "${sub}". Next: run hoolix profile list.`);
  process.exit(1);
}
