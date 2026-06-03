# hoolix Packaging, Binary Distribution & Installation (Track B)

**Owner:** Packaging track  
**Status:** Current (beta release ready)  
**Note:** The hard parts (self-contained binaries via `__internal-host`, cross-platform installers, doctor, CI matrix, and reliable process management) are complete and battle-tested.

## Goals
- Single-file distributable native binaries via `bun build --compile` (preferred, per project Bun usage).
- Zero-dependency install experience for end users on Windows, macOS, Linux via simple `install.sh` / `install.ps1`.
- Support both:
  - Prebuilt binaries (primary recommended path, via GH Releases + install scripts).
  - JS distribution via npm / `bun install -g hoolix` / `bunx` (uses the existing bin wrapper + compiled dist/).
- Make `hoolix start <slug>` "just work" after install (no manual host commands) by leveraging self-contained binary.
- Provide `doctor` command (skeleton + extensible) for diagnostics + install verification.
- Set up structure for automated binary builds on GitHub Releases / CI (even if workflow is skeleton).
- Document everything for users and contributors.

## Current State Assessment
- **CLI**: Hand-rolled dispatcher in `src/index.ts`. Full command set: `create`, `list`, `start`, `stop`, `info`, `delete`, `reindex`, `verify`, `update`, `doctor`, `version`, `help` (tui placeholder remains).
- **Package**: Cleaned of stale `oclif` references. Versioned pre-release (0.0.1-beta). Prebuilt binaries are the recommended path.
- **Process/Host spawning** (`src/process/manager.ts`): Production-ready for binaries.
  - Compiled binary → `currentBin __internal-host --slug ...`
  - Dev (improved): prefers local `node_modules/.bin/tsx(.cmd)` when available, falls back to `--import tsx`. Much more reliable on Windows.
  - Health probes via `/health`, runtime markers, `tree-kill` + `ps-list` for robust cross-platform lifecycle.
- **Host logic** (`src/mcp/host.ts`): Fully functional. Real tools (`search_documentation`, `read_documentation_page`, `get_table_of_contents`), Hono + official SDK Streamable HTTP, proper auth middleware, graceful shutdown.
- **RAG**: Fuse.js + rich per-chunk JSON (zero native deps). Excellent for bundling. `llms-full.txt` and multi-page manifest support produce high-quality indexes with source URLs.
- **Ingestion**: First-class `llms.txt` / `llms-full.txt` + multi-page crawling, heading-aware chunking, HTML→MD, progress reporting.
- **Optional conditional deps** (v0.0.2+): `@huggingface/transformers` (hybrid BGE RAG, dynamic + per-server flag — only on --hybrid paths). The TUI is currently pure Node and dynamically imported on the TUI path, so it does not require Ink/React. Base experience and most commands remain zero-heavy-dep. Hybrid adds first-use model download to HF cache. Documented in FAQ + AGENTS.md binary discipline. Old LanceDB etc. still fully removed from hot paths.
- **Data**: `env-paths` for cross-platform `~/.hoolix` (or Windows equivalent). Clean Zod-validated registry + per-server data.
- **Distribution**: `install.sh` / `install.ps1` + GitHub Actions matrix (5+ platforms) + `--minify` binaries + `doctor` for post-install verification. All working.
  - `cmdStart` in `src/index.ts` calls `serverManager.start`; manual `npx tsx ...` output is only a fallback when spawn fails in development.
  - No handling for `__internal-host` dispatch in `main()` / CLI entry (required so spawned binary processes run the host server logic).
  - No build scripts for `bun build --compile`.
  - No install scripts, no .github/workflows for binaries, no `doctor`.
  - package.json: placeholder repo URLs, non-crossplat `clean` (rm), no binary build targets, unused oclif stanza.
  - No LICENSE file (referenced in "files").
  - README quickstarts are source/dev focused.
  - Version hardcoded in a couple places.
- **Background tasks note**: Recent `npm install` + test script runs exited 1 (possibly network/dep fetch issues with LanceDB on this env; node_modules present and partial). Bun not installed in current Windows shell (only Node 25 + npm).

Exploration used: list_dir (root + all src subdirs), read_file (package.json, bin/, all core src files + key others), grep (scoped !node_modules for patterns like imports, "bun build", spawn logic, Lance etc.), run_terminal_command (for dotfiles, hidden dirs, availability checks, exhaustive file listings). No other build/CI/packaging artifacts existed.

## Concrete Implementation Plan
1. **Build System (Bun Compile First)**
   - Prefer `bun build --compile` (single native executable, includes Bun runtime, excellent TS/ESM support, no external node/bun required on target).
   - Local dev: `bun run build:binary` (or `build:binary:win` etc.) produces platform-specific binary in `dist-bin/`.
   - Cross-platform builds **only in CI** (matrix of GitHub runners: ubuntu, windows, macos + macos for arm/x64 variants). Bun compile is host-native.
   - Output naming (see below).
   - Also keep `tsc` build for the "npm package JS distribution" path (prepublish).
   - Make `clean` cross-platform (node one-liner or `git clean` fallback; avoid new deps).
   - Bundle notes: Static imports in index.ts for host logic (to ensure bundler includes `src/mcp/host.ts` + its deps like hono, mcp sdk, rag/store). Use dynamic import inside the internal-host branch for safety if needed.
   - Test: After changes, binaries should `hoolix --version`, `hoolix doctor`, `hoolix create ...` (ingest uses net), etc.
   - Future: Strip unused deps (Lance etc.) from package.json once confirmed dead.

2. **Binary Naming Convention (for Releases + Install Scripts)**
   - `hoolix-{os}-{arch}[.exe]`
   - os: `linux`, `darwin`, `windows`
   - arch: `x64`, `arm64` (map from uname: x86_64→x64, aarch64/arm64→arm64; win: PROCESSOR_ARCHITECTURE x86→? but start x64/arm64)
   - Examples:
     - `hoolix-linux-x64`
     - `hoolix-darwin-arm64`
     - `hoolix-windows-x64.exe`
   - In CI: build on appropriate runner, rename/ output with correct name, attach as release asset (no zips for simplicity; keep small).
   - Local builds: append current platform or use env var.

3. **GitHub Releases + CI Structure**
   - Create `.github/workflows/build-binaries.yml` (skeleton + comments for full impl).
     - Trigger: `on: release: { types: [published] }` + `workflow_dispatch` (manual for testing).
     - Also on tag push for pre-releases.
     - Matrix:
       ```yaml
       strategy:
         matrix:
           include:
             - os: ubuntu-latest
               target: linux-x64
             - os: ubuntu-latest  # or arm runner if avail
               target: linux-arm64
             - os: macos-13
               target: darwin-x64
             - os: macos-14  # or latest arm
               target: darwin-arm64
             - os: windows-latest
               target: windows-x64
             # arm64 win future
       ```
     - Steps: checkout, `oven-sh/setup-bun`, `bun install`, `bun run build:binary` (or direct bun build --compile with target hints if supported), rename to canonical name, upload via `softprops/action-gh-release` (or artifacts for manual).
     - Permissions: contents:write for release attach.
     - Optional: generate checksums (sha256), sign (later).
   - Release process (documented): `git tag v0.2.0 && git push --tags` → CI builds + attaches → users/install scripts consume.
   - Fallback in install scripts: if asset 404, suggest `bunx hoolix` or build-from-source instructions.
   - Also support querying latest via GH API (`/repos/owner/repo/releases/latest`) in install scripts for "latest" installs (no hard-coded versions).

4. **install.sh (Unix: Linux + macOS)**
   - Pure bash, no deps beyond curl/wget, chmod, etc.
   - Flags: `--version vX.Y.Z` (or "latest"), `--prefix /custom/bin`, `--no-path-update`, `--help`.
   - Detect:
     - OS: `uname -s` → lowercase, darwin/linux (error others).
     - ARCH: `uname -m` → normalize (x86_64/x64, aarch64/arm64, armv7l etc. map or error).
   - Download: `https://github.com/JayLLM/hoolix/releases/download/${VER}/hoolix-${OS}-${ARCH}`
     - For latest: first `curl -s https://api.github.com/repos/.../releases/latest | grep tag_name` parse (jq optional fallback to grep).
   - Install location priority: `$PREFIX` > `$HOME/.local/bin` > `/usr/local/bin` (if writable) > `$HOME/bin`.
   - `chmod +x`, `mv` (sudo if needed for system dirs, with prompt).
   - PATH: Append to `~/.profile`, `~/.bashrc`, `~/.zshrc`, `~/.config/fish/config.fish` etc. if not present. Print `export PATH=...` snippet + `source` instructions. Detect current shell.
   - Post-install: Run `${INSTALL_DIR}/hoolix doctor --json` (or version) to verify. Print success + "restart shell" note.
   - Idempotent, error on fail, support non-interactive.
   - Shebang: `#!/usr/bin/env bash`

5. **install.ps1 (Windows PowerShell 5.1+ / pwsh)**
   - Cross "edition" aware.
   - Similar flags (as params).
   - Detect: `$IsWindows` (or $PSVersion), arch via `[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture` or env PROCESSOR_ARCHITECTURE (AMD64→x64, ARM64→arm64).
   - Download: `Invoke-WebRequest` or `curl.exe` (Win10+), from GH release (handle TLS, progress).
   - Install dir: `$env:LOCALAPPDATA\Programs\hoolix` (or `$HOME\.local\bin`, user choice via -Prefix).
   - Place `hoolix.exe`.
   - PATH: Use `[Environment]::SetEnvironmentVariable` (User scope) + `setx` fallback. Warn: "Open new PowerShell for PATH to take effect."
   - No sudo usually needed for user dirs.
   - Post: `& $exe doctor`
   - Handle execution policy? Instructions or `Set-ExecutionPolicy` note.
   - Shebang for pwsh compat if needed, but .ps1.

6. **package.json Updates**
   - `scripts`:
     - Keep `build` (tsc), `clean` (improve: `node -e 'fs.rmSync("dist", {recursive:true,force:true})'` + for dist-bin).
     - Add: `"build:binary": "bun build --compile src/index.ts --outfile dist-bin/hoolix"`,
       platform variants or use env: `BUILD_TARGET` logic in a small helper if desired.
     - `"build:binary:current": "..."`, `"prepublishOnly": "npm run build"`.
     - Update `clean` to remove dist dist-bin.
   - Add fields:
     - `"repository": { "type": "git", "url": "https://github.com/JayLLM/hoolix.git" }`,
     - `"bugs"`, `"homepage"` already placeholder — make consistent (assume org or update later).
   - `bin` already points to wrapper (good for npm path).
   - `files`: add "dist-bin"? No — binaries not shipped in npm tarball (too platform specific; releases handle them).
   - Remove or comment unused `"oclif"` stanza (no commands/ dir populated; CLI is custom).
   - `engines`: keep node for the JS path; note bun for compile.
   - Version sync: consider `import pkg from '../package.json'` but for binary, simple const ok for v0.1.x. (Bun compile can include json.)
   - Add `"type": "module"` already present.

7. **Doctor Command (src/index.ts)**
   - New case `'doctor'`: 
     - Always: print version, runtime (node/bun/binary detection via execPath + `process.versions`), platform.
     - Paths: call `ensureDirectories()`, `getPaths()`, report locations + writable test (try write temp file).
     - Config + Registry: loadConfig(), listServers() count, any errors caught + reported.
     - RAG/Ingestion smoke: (light) check if can import modules.
     - Process mgmt: try ps-list quick, report.
     - Network: optional `fetch` to example.com or GitHub (timeout, --offline flag).
     - Running servers: for each in registry, call getStatus + report.
     - Suggestions: "To create your first: hoolix create ...", "Update PATH if needed", "For issues: hoolix --help".
     - `--json` support for scripting (install scripts love this).
     - Exit 0 on healthy, 1 on warnings/errors (or always 0, report status).
   - Extensible: easy to add future checks (e.g. disk space via fs, model cache in .hoolix/cache).
   - Nice output with chalk + sections (or clack if fits).

8. **Self-Contained Binary + Start Wiring (Critical for "just works")**
   - **Major decision**: Single unified binary (CLI entry + internal host mode) vs. shipping separate `hoolix-host` binary.
     - **Chosen: Single binary.** Rationale: Simpler distribution (fewer assets, one install), no skew between CLI and host versions, manager.ts already designed around `currentBin __internal-host`. Users get one command. Size overhead minimal (host code + deps like hono/mcp-sdk shared in bundle).
     - Alternative rejected (for now): two binaries would require dual release assets, dual install logic, more CI complexity.
   - Implementation (coordinate with main agent):
     - In `src/index.ts` `main()`: early check `if (args[0] === '__internal-host') { await runInternalHost(args); return; }`
     - Implement `runInternalHost`: parse --slug etc (reuse or import from host.ts), `import('./mcp/host.js').then(m => m.startHostedServer(...))`
     - Update `cmdStart`: instead of printing manual npx + "run in other terminal", do:
       ```ts
       const { port, authKey, pid } = await serverManager.start(slug, { port: ..., authKey });
       // then print the nice connection JSON block + "Server running (PID: pid). Use hoolix stop ..."
       ```
     - This makes `hoolix start` fully functional in binary (spawns child copy of self in host mode) and still works in dev (tsx path).
     - Bonus: `cmdStart` can support `--detach` etc.
   - Bundler: To ensure `src/mcp/host.ts` (and transitive: hono, @modelcontextprotocol/server, rag/*, etc.) is included in the bun compile of `src/index.ts`, add a top-level `import('./mcp/host.js').catch(() => {})` or better a static `import * as host from './mcp/host.js'` (even if unused in normal path; bundlers keep for side effects + exports). Or move shared types. (Bun is smart with dynamic in branches.)
   - Result: After `hoolix install` (or direct binary), `hoolix start my-docs` launches the server in background child process, prints MCP config block. `stop` / `info` continue to work. Zero manual steps.

9. **Other Polish & Cross-Platform**
   - `.gitignore`: add `dist-bin/`, `*.exe`, release assets patterns if needed.
   - LICENSE: Create minimal MIT (task doesn't explicitly forbid if required for packaging; referenced in package.json "files"). Or note in plan.
   - Version: Centralize (e.g. in core or package.json import — bun supports `import pkgJson from '../package.json' assert {type:'json'}` or with import attrs).
   - First-run: In main (after ensure), if no servers and not internal, perhaps subtle welcome (future).
   - Error handling in installs: robust, colored? (bash colors, pwsh).
   - Uninstall: simple `rm` the binary + note data in ~/.hoolix stays (or doctor --purge-data? future).
   - Security: Install scripts from trusted GH only; suggest `curl | bash` caution (common pattern, or provide checksum verify).
   - Testing installs: On real machines + CI (future `action` that runs the scripts in containers).
   - Bun install in env: For local binary builds here, user can run the Windows install for bun first.

10. **Documentation & Coordination**
    - This PACKAGING.md is the living spec + decision log for the track.
    - Update README.md with prominent "Installation" section (scripts first, then bun/npm, build from source, doctor).
    - Update dev section, quick demo (include post-install examples).
    - Add "Binary Distribution" subsection.
    - In code comments (e.g. index.ts, manager.ts) reference this.
    - When main agent finishes host wiring, sync notes here.

## Major Decisions Surfaced (for Review / Main Agent Sync)
1. **Single binary with __internal-host dispatch** (chosen over dual binaries or embedding host as lib only). See section 8. Enables the "hoolix start just launches" goal perfectly. Requires small entrypoint changes (which also improve the current placeholder start cmd).
2. **Bun compile primary; tsc secondary for npm path**. Matches "packageManager": "bun", dev:bun script, and modern perf (no node dep for binary users). Tradeoff: CI matrix required for multi-arch (can't easily cross-compile natives anyway).
3. **GH Releases as source of truth for binaries** (install scripts + CI). npm for the JS variant. Allows "latest" without publishing every binary to npm (which doesn't support platform bins well without optional deps hacks).
4. **Install location + PATH strategy**: User-local first (no admin), append rc files, clear post-install messaging. Pragmatic for CLI tools (matches e.g. bun, starship, etc. installers).
5. **Doctor as first-class**: Not just skeleton — make it useful immediately for verification + user troubleshooting. Callable from install scripts with --json.
6. **Scope discipline**: Focus on distribution (build, scripts, CI skeleton, doctor, docs, package updates, + minimal wiring for self-containment). Do not rewrite ingestion/RAG/TUI. Leave full CI polish / signing / auto-updates to future.
7. **Fallbacks**: Install scripts always have escape hatches to bunx/npm or "build from source" (which will use the same bun compile).
8. **Windows priority**: User on pwsh; ps1 must be solid + tested conceptually here. Unix scripts equally complete.
9. **No new runtime deps**: All changes use existing (chalk, fs-extra, clack for prompts if fits in doctor, node built-ins).

## Historical Note
This document captured early packaging/distribution planning. Many items (binaries for win/linux/mac, release automation, doctor, internal-host model) have since been implemented. See RELEASE.md, .github/workflows/release.yml, and AGENTS.md for current state.

Future polish ideas (non-blocking): Homebrew/winget, checksum sidecars, signed builds, self-update command (the updater.ts skeleton exists).
- install.sh (new)
- install.ps1 (new)
- README.md (updates)
- .gitignore (minor)

This plan is pragmatic, leverages existing prep in manager.ts, delivers all requested (build system, install scripts, package updates, doctor skeleton, CI structure, README docs, self-contained start).

---
*Written autonomously per mission. Major decisions called out for visibility.*
