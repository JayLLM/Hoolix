# Releasing Hoolix

This document describes how to cut new releases (including betas) for hoolix.

We use [`release-it`](https://github.com/release-it/release-it) for versioning, changelog updates, tagging, and GitHub Releases. Binaries are built via GitHub Actions and npm is published with provenance.

## Prerequisites

| Secret | Purpose |
|---|---|
| `GITHUB_TOKEN` | Auto-injected by Actions — write access for tag + release |
| `NPM_TOKEN` | npm publish — add to repo Settings → Secrets → Actions |
| `GPG_PRIVATE_KEY` | (Optional) GPG key for `.asc` detached signatures |
| `GPG_PASSPHRASE` | (Optional) Passphrase for the GPG key |

## CI / Automated Release via GitHub Actions (Recommended)

1. Go to the repo → **Actions → Release → Run workflow**.
2. Choose `release_type`:
   - `patch`, `minor`, `major` — stable semver bump → published as `latest` on npm.
   - `beta` — pre-release → published as `next` on npm.
3. Click **Run workflow**.

The four-job pipeline:

```
prepare-release
  → release-it: bump package.json, sync version.ts, update CHANGELOG,
                commit, tag, create GitHub Release
       |
       ├── build-binaries (parallel)
       │     Linux x64 (ubuntu-latest)
       │     Linux arm64 (ubuntu-24.04-arm)
       │     macOS Intel (macos-13)
       │     macOS Apple Silicon (macos-14)
       │     Windows x64 (windows-latest)
       │
       └── publish-npm (parallel)
             bun install → bun run build → bun test
             → npm publish --access public --provenance --tag latest|next
       |
attach-release-assets
  → generate SHA256SUMS
  → GPG-sign binaries (if GPG_PRIVATE_KEY set)
  → upload all assets to GitHub Release
```

## Local Release

```bash
# Dry run — safe, no network writes
npm run release:dry

# Interactive release
npm run release

# Beta / pre-release
npm run release:beta
```

Requires Bun and a GitHub PAT with `repo` scope (or `gh auth login`).

## CHANGELOG Workflow

The `[Unreleased]` section in `CHANGELOG.md` is the source of truth for the next release notes.

- Add entries to `[Unreleased]` as you work.
- `release-it` (via `@release-it/keep-a-changelog`) moves the section to the new version on release.
- GitHub Release body is generated from `scripts/changelog-unreleased.cjs`.

Preview release notes:
```bash
node scripts/changelog-unreleased.cjs 0.0.1-beta.20
```

## After Release

1. Verify the GitHub Release page has correct notes, attached binaries, `SHA256SUMS`, and `.asc` files (if GPG configured).
2. Confirm npm: `npm info hoolix dist-tags` should show the new version under `latest` or `next`.
3. Run installer smoke tests.

### Installer Smoke Tests

**Windows:**
```powershell
$dir = Join-Path $env:TEMP "hoolix-install-test"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
PowerShell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Prefix $dir -NoPathUpdate
& "$dir\hoolix.exe" doctor --json
& "$dir\hoolix.exe" --version
```

**macOS / Linux:**
```bash
tmp_dir="$(mktemp -d)"
./install.sh --prefix "$tmp_dir" --no-path-update
"$tmp_dir/hoolix" doctor --json
"$tmp_dir/hoolix" --version
```

**npm:**
```bash
npm install -g hoolix@latest   # or hoolix@next for beta
hoolix doctor
hoolix --version
```

## Configuration

- Main config: `.release-it.json` (git behavior, GitHub releases, keep-a-changelog plugin).
- Version sync hook: `scripts/sync-version.cjs` — runs `after:bump`, keeps `src/core/version.ts` in sync with `package.json`.
- GitHub release notes: `scripts/changelog-unreleased.cjs ${version}`.
- CI workflow: `.github/workflows/release.yml`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Working dir must be clean" | Commit or stash; use `--no-git.requireCleanWorkingDir` for dry runs |
| npm publish fails | Verify `NPM_TOKEN` is in repo Secrets |
| Binary not attached | Check `build-binaries` succeeded; `attach-release-assets` depends on all 5 artifacts |
| GPG signing skipped | Normal when `GPG_PRIVATE_KEY` is not set; release proceeds without `.asc` |
| `--provenance` fails | Verify `id-token: write` is on the `publish-npm` **job** (not workflow level) |

For more detail see [RELEASE.md](../RELEASE.md) and [PACKAGING.md](../PACKAGING.md) at the repo root.

Happy releasing!
