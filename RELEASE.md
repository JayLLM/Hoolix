# hoolix Release Instructions

## Current Status (Beta)
- Production-grade beta: llms.txt + GitHub-aware ingestion, Fuse + optional hybrid BGE RAG with grounding, `connect` one-command client wiring, full Ink TUI (default), key rotation, rate+audit, self-contained binaries, `verify` (quality + scores), polished CLI + `--json`, cross-platform installers + doctor.
- `hoolix` (TUI), `start`, `connect` just work after binary install.
- Full release + CI (binary matrix + smoke), docs leadership (gold standard site + AGENTS.md), examples, contribution templates.
- Binary size ~99-110 MB (documented tradeoffs for TUI + hybrid optionals; lazy loading enforced).

## How to Cut a Release

1. **Bump version** in `package.json`.

2. **Local test (with Bun installed)**:
   ```bash
   bun install
   bun run build:binary          # or build:binary:win on Windows
   ./dist-bin/hoolix doctor
   ./dist-bin/hoolix create "Test" --url https://example.com/llms.txt --yes
   ```

3. **Tag and push** (use the beta versioning scheme):
   ```bash
   git add -A
   git commit -m "chore: release v0.0.1-beta"
   git tag v0.0.1-beta
   git push origin main --tags
   ```

4. GitHub Actions will automatically:
   - Build minified binaries for linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64.
   - Attach them to the GitHub Release.

5. **Test installers** (on clean machines):
   - Windows: `iex (irm https://raw.githubusercontent.com/JayLLM/hoolix/main/install.ps1)`
   - Unix: `curl -fsSL https://raw.githubusercontent.com/JayLLM/hoolix/main/install.sh | sh`

6. Update any remaining org/repo references if you ever fork (currently points to JayLLM/hoolix).

## Post-Release Polish Ideas (Future)
- Add shell completions.
- `hoolix export` for self-contained servers.
- Full Ink TUI dashboard as the default experience.
- Optional high-quality vector embeddings (Fuse.js is excellent and zero-dep today).
- Better handling for aggressively protected llms.txt endpoints.

The project is in a releasable beta state and ready for real users.
