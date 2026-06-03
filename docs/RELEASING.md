# Releasing hoolix

This document describes how to cut new releases (including betas) for hoolix.

We use [`release-it`](https://github.com/release-it/release-it) for versioning, changelog updates, tagging, and GitHub Releases. Binaries are built and attached via GitHub Actions.

## Prerequisites
- Write access to the repo (for tags and releases).
- `GITHUB_TOKEN` is automatically available in Actions; for local releases you may need a personal access token with `repo` scope (or use `gh auth login` + release-it github plugin config).
- Bun installed (for scripts and builds).

## Local Release (Recommended for most cases)

1. Make sure your working directory is clean (`git status`).
2. Update `CHANGELOG.md` under the `[Unreleased]` section with the changes for this release (following Keep a Changelog style). Commit these changes if needed.
3. Run the release command:

   **Normal release (patch by default, or specify):**
   ```bash
   npm run release          # uses release-it (interactive prompt for increment if needed)
   # or non-interactive
   npx release-it --increment=patch
   ```

   **Beta / pre-release:**
   ```bash
   npm run release:beta
   # or
   npx release-it --preRelease=beta
   ```

   **Dry run (safe to test):**
   ```bash
   npm run release:dry
   # or with flags
   npx release-it --dry-run --increment=patch --no-git.requireCleanWorkingDir
   ```

4. `release-it` will:
   - Bump the version in `package.json`.
   - Sync `src/core/version.ts` from `package.json` via `scripts/sync-version.cjs`.
   - Update `CHANGELOG.md` (moves Unreleased content to the new version section).
   - Commit, create annotated tag (e.g. `v0.0.2`), push.
   - Create a GitHub Release with the changelog as body.

5. The Release workflow builds and attaches platform binaries from the released tag.

## CI / Automated Release via GitHub Actions

Use the manual "Release" workflow for controlled releases (safer in beta):

1. Go to the repo → Actions → "Release" workflow → "Run workflow".
2. Choose the `release_type`:
   - `patch`, `minor`, `major` for normal semver bumps.
   - `beta` for pre-release. From the reset base version `0.0.0`, the first beta produces `0.0.1-beta.0`.
3. The workflow will:
   - Run `release-it` (with the chosen type) to handle bump, changelog, tag, and GitHub Release creation.
   - Check out the released tag.
   - Build Linux x64, Linux arm64, macOS arm64, and Windows x64 binaries.
   - Attach those binaries to the GitHub Release.

Manual dispatch is the supported release path. The standalone "Build Binaries" workflow is manual-only for ad hoc binary inspection.

## After Release

- Verify the GitHub Release page has the correct notes + attached binaries.
- Test the install scripts with the new version (they support `--version` / `-Version` and `--stable` / `-Stable`).
- Announce if appropriate (e.g. in discussions or Discord).
- For the next cycle, the top of `CHANGELOG.md` will have a fresh `[Unreleased]` section (the plugin helps maintain this).

### Installer Smoke Tests

Windows:

```powershell
$dir = Join-Path $env:TEMP "hoolix-install-test"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
PowerShell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Version v0.0.1-beta.0 -Prefix $dir -NoPathUpdate
& "$dir\hoolix.exe" doctor --json
```

macOS / Linux:

```bash
tmp_dir="$(mktemp -d)"
./install.sh --version v0.0.1-beta.0 --prefix "$tmp_dir" --no-path-update
"$tmp_dir/hoolix" doctor --json
```

## Configuration

- Main config: `.release-it.json` (git behavior, GitHub releases, keep-a-changelog plugin).
- Version sync hook: `scripts/sync-version.cjs`.
- GitHub release notes are read from the current `[Unreleased]` section by `scripts/changelog-unreleased.cjs`.
- Scripts in `package.json`: `release`, `release:beta`, `release:dry`, `release:ci`.
- The GitHub Release workflow lives in `.github/workflows/release.yml`.
- Existing `build-binaries.yml` is manual-only and does not attach release assets.

## Tips for Beta Releases

- Use `release:beta` or the `beta` option in the Actions UI. This sets `preRelease` appropriately so the GitHub Release is marked as a pre-release.
- The first beta from the reset base is `0.0.1-beta.0`.
- You can do multiple betas before a stable `patch` / etc.
- Beta binaries can discover newer beta releases through `hoolix update`; stable binaries only consider stable GitHub releases.
- Installers resolve prereleases by default during beta; users can pass `--stable` / `-Stable` to ignore prereleases.

## Troubleshooting

- "Working dir must be clean": Commit or stash changes, or use `--no-git.requireCleanWorkingDir` (for dry runs).
- Missing GITHUB_TOKEN: For local, configure a PAT in env or use the GitHub CLI (`gh`) which release-it can integrate with.
- Changelog errors: Ensure there's an `[Unreleased]` section with content before running a real release.
- Dry-run release notes: `release-it --dry-run` may show `node scripts/changelog-unreleased.cjs` literally because dry runs do not execute release-note commands. Run `node scripts/changelog-unreleased.cjs` to preview the real GitHub release body.
- Binary not attached: Check that the release was created (triggers the attach workflows) and that the tag matches.

For questions, open an issue or refer to the release-it docs.

Happy releasing!
