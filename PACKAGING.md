# Hoolix — Packaging & Binary Distribution

**Status:** Current (beta, npm + binary distribution live)

This document describes how Hoolix is packaged and distributed, what the binary contains, and how cross-platform builds work.

---

## Distribution Methods

### 1. npm Global Package (Recommended)

```bash
npm install -g hoolix       # stable
npm install -g hoolix@next  # beta / pre-release
```

- Shipped as a standard npm tarball on the public registry.
- Published with `npm publish --provenance` so the build → source → package chain is cryptographically verifiable on npmjs.com.
- `bin/hoolix.js` is the entry shim. It uses `await import(distEntry)` in the same process — correct signals (Ctrl+C in TUI), fast startup, no subprocess overhead.
- `prepublishOnly` compiles TypeScript (`tsc → dist/`) before publish.
- `postinstall` (`bin/postinstall.js`) prints a welcome message on first global install (skipped in CI, pipes, and dev checkouts).

**Files included in the npm tarball** (`"files"` in package.json):
```
bin/           # hoolix.js shim + postinstall.js
dist/          # compiled TypeScript (tsc output)
README.md
LICENSE
STABILITY.md
```

Binaries (`dist-bin/`) are **not** shipped in the npm tarball — they are platform-specific and live on GitHub Releases.

### 2. Standalone Native Binary (bun build --compile)

Self-contained executables that bundle the Bun runtime. No Node.js, npm, or source files required on the target machine.

```bash
# Built locally
bun run build:binary         # → dist-bin/hoolix (current platform)
bun run build:binary:win     # → dist-bin/hoolix.exe

# Built in CI for all platforms (see release.yml)
```

**Platform matrix:**

| Binary name | Runner | Platform |
|---|---|---|
| `hoolix-linux-x64` | `ubuntu-latest` | Linux x64 |
| `hoolix-linux-arm64` | `ubuntu-24.04-arm` | Linux arm64 |
| `hoolix-darwin-x64` | `macos-13` | macOS Intel |
| `hoolix-darwin-arm64` | `macos-14` | macOS Apple Silicon |
| `hoolix-windows-x64.exe` | `windows-latest` | Windows x64 |

All binaries are attached to GitHub Releases via the `attach-release-assets` CI job.

#### Binary size discipline

The compiled binary bundles the Bun runtime + all production dependencies. Key size contributors:
- Hono + MCP SDK (HTTP host)
- Fuse.js (RAG)
- jsdom / Readability (lazy-loaded on HTML fetch paths only)
- React/Ink (TUI, dynamically imported only on tui path)
- `@huggingface/transformers` (hybrid RAG, lazy dynamic import only)

**Invariant:** Never add always-on heavy dependencies to the hot path without a feature flag, ADR, and FAQ update. Use `bun build --compile` + `ls -lh dist-bin/hoolix` to measure impact before merging.

### 3. Install Scripts

Scripts that download and install the appropriate binary from GitHub Releases:

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/JayLLM/hoolix/main/install.sh | bash

# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/JayLLM/hoolix/main/install.ps1 | iex
```

Both scripts:
- Detect OS and architecture.
- Resolve the latest release from the GitHub API (or use `--version vX.Y.Z`).
- Download the binary to a user-writable location.
- **Verify the SHA-256 checksum** against `SHA256SUMS` from the same release.
- Add to PATH (with instructions when auto-update is not possible).
- Run `hoolix doctor --json` post-install.

---

## Self-Contained Binary Invariant

`hoolix start <slug>` and `hoolix` (TUI) must work after binary install with zero external runtime or source.

This is implemented via the `__internal-host` and `__internal-proxy` self-spawn model:

```
hoolix start foo
  → hoolix __internal-host --slug foo --port N --data-dir ... --auth-key ...
      (same binary re-enters the host path)

hoolix start foo --proxy
  → hoolix __internal-proxy --slug foo --port N --data-dir ... --auth-key ...
      (same binary re-enters the proxy path, which spawns the stdio child)
```

`ServerManager` (`src/process/manager.ts`) handles:
- Port selection.
- Runtime marker writes.
- Cross-platform process spawn (`ps-list` + `tree-kill`, no Unix signals).
- Health probe wait.
- Status reporting to CLI, TUI, and GUI.

In development, the same dispatch uses `tsx` (or `bun run src/...`) so contributors never need to rebuild the binary to iterate.

---

## SHA-256 Checksums and GPG Signing

Every GitHub Release includes a `SHA256SUMS` file covering all platform binaries.

```bash
# Verify on Linux
sha256sum --check SHA256SUMS

# Verify on macOS
shasum -a 256 -c SHA256SUMS
```

GPG `.asc` detached signatures are generated automatically if the `GPG_PRIVATE_KEY` repository secret is configured (optional). If not set, the release proceeds without GPG signatures.

`hoolix update` also verifies the SHA-256 of the downloaded binary before applying it. Use `hoolix update --no-verify` to skip (not recommended).

npm packages carry npm provenance automatically — no extra steps needed.

---

## Release CI Pipeline

Four sequential/parallel jobs in `.github/workflows/release.yml`:

```
prepare-release (release-it → bump, CHANGELOG, tag, GitHub Release)
       |
       ├── build-binaries (parallel — 5-platform matrix)
       └── publish-npm (parallel — npm publish --provenance --tag latest|next)
       |
attach-release-assets (SHA256SUMS + optional GPG .asc + binary upload)
```

Key points:
- `id-token: write` is scoped to `publish-npm` only — never granted at workflow level.
- `is_prerelease` detects any `-` in the version string. Prerelease → `--tag next`. Stable → `--tag latest`.
- GPG secret availability is detected via an env-var probe step (secrets are masked in `if:` expressions).
- `darwin-x64` uses `macos-13`; `darwin-arm64` uses `macos-14`.

---

## npm Provenance (npm Publish)

`publish-npm` runs:

```bash
npm publish --access public --provenance --tag "$NPM_TAG"
```

`--provenance` requires `id-token: write` (OIDC) and `setup-node` with `registry-url`. The provenance statement links the npm package back to the exact GitHub Actions run and commit SHA that published it.

---

## Local Binary Build

```bash
bun run build:binary          # → dist-bin/hoolix
./dist-bin/hoolix --version
./dist-bin/hoolix doctor
./dist-bin/hoolix create "Test" --url https://example.com/llms.txt --yes
./dist-bin/hoolix verify test
./dist-bin/hoolix connect test --client generic --json
./dist-bin/hoolix delete test --yes
```

The binary smoke is also run in CI on each platform (`matrix.runner`).

---

## Historical Note

Earlier versions of this document captured packaging planning decisions (single binary model, `__internal-host` dispatch, bun compile rationale). Those decisions are now implemented. See `.github/workflows/release.yml`, `src/process/manager.ts`, `src/mcp/host.ts`, and `RELEASE.md` for the live implementation.
