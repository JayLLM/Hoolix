# Hoolix — Release Guide

Releases are driven by GitHub Actions (`release.yml`) triggered via `workflow_dispatch`. The workflow runs `release-it`, builds all platform binaries, publishes to npm, and attaches signed assets to the GitHub Release.

## Prerequisites

| Secret | Purpose |
|---|---|
| `GITHUB_TOKEN` | Auto-injected by Actions — used by release-it for tag push + GitHub Release |
| `NPM_TOKEN` | npm publish (`npm publish --provenance`) — set in repo Settings → Secrets |
| `GPG_PRIVATE_KEY` | (Optional) GPG private key for `.asc` detached signatures |
| `GPG_PASSPHRASE` | (Optional) Passphrase for the GPG key above |

---

## How to Cut a Release

### Via GitHub Actions UI (Recommended)

1. Go to **Actions → Release → Run workflow**.
2. Select `release_type`:
   - `patch`, `minor`, `major` — normal semver bump (publishes to npm `latest`).
   - `beta` — pre-release (publishes to npm `next`).
3. Click **Run workflow**.

The workflow will:
1. **`prepare-release`** — runs `release-it`: bumps `package.json` version, syncs `src/core/version.ts`, updates `CHANGELOG.md`, commits, creates an annotated tag, and creates the GitHub Release.
2. **`build-binaries`** (parallel) — compiles `hoolix-linux-x64`, `hoolix-linux-arm64`, `hoolix-darwin-x64`, `hoolix-darwin-arm64`, `hoolix-windows-x64.exe` and runs smoke tests.
3. **`publish-npm`** (parallel) — builds TypeScript, runs tests, then `npm publish --provenance --tag latest|next`.
4. **`attach-release-assets`** — generates `SHA256SUMS`, optionally signs with GPG, uploads all assets to the GitHub Release.

### Local Release (Dry Run / Preview)

```bash
# Dry run — safe, no changes pushed
npm run release:dry

# Interactive release (uses .release-it.json config)
npm run release

# Beta / pre-release
npm run release:beta
```

Local release requires Bun and a GitHub PAT with `repo` scope (or `gh auth login`).

---

## After a Release

1. Verify the GitHub Release page has the correct notes, attached binaries, `SHA256SUMS`, and (if GPG configured) `.asc` signatures.
2. Confirm the npm package is live: `npm info hoolix version` (or `hoolix@next` for betas).
3. Test install scripts:

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

4. Announce if appropriate (GitHub Discussions, etc.).
5. CHANGELOG.md will have a fresh `[Unreleased]` section for the next cycle.

---

## Versioning

Hoolix follows [Semantic Versioning](https://semver.org):

| Change type | Bump |
|---|---|
| Breaking CLI / data format change | **MAJOR** |
| New command, template, or flag | **MINOR** |
| Bug fix, performance, or non-breaking behaviour | **PATCH** |
| Pre-release iteration | `0.0.1-beta.N` |

Pre-releases install to npm under the `next` dist-tag. Stable releases install under `latest`.

---

## CHANGELOG Workflow

The `[Unreleased]` section in `CHANGELOG.md` is the source of truth for the next release notes.

- Add entries to `[Unreleased]` as you work.
- `release-it` (via `@release-it/keep-a-changelog`) moves the section to the new version on release.
- GitHub Release body is generated from `scripts/changelog-unreleased.cjs`.

**Dry-run preview of release notes:**
```bash
node scripts/changelog-unreleased.cjs 0.0.1-beta.20
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Working dir must be clean" | Commit or stash changes; use `--no-git.requireCleanWorkingDir` for dry runs |
| npm publish fails — missing token | Add `NPM_TOKEN` to repo Secrets → Actions |
| Binary not attached to release | Check that `build-binaries` succeeded; `attach-release-assets` requires all 5 artifacts |
| GPG signing skipped | Normal if `GPG_PRIVATE_KEY` secret is not set; the release still proceeds |
| `npm publish --provenance` fails | Verify `id-token: write` is on the `publish-npm` job (not workflow level) |

---

See [PACKAGING.md](./PACKAGING.md) for binary build details, SHA-256 verification, and distribution architecture.
