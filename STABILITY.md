# Hoolix Stability & Versioning Promises

**Current stable version: 1.0.0 (released 2026-06-04)**

This document describes what is stable, what may change, and the versioning policy for Hoolix v1.0 and beyond.

## Installation (recommended)

```bash
npm install -g hoolix        # recommended — provenance-verified
```

Standalone binary (Linux/macOS):
```bash
curl -fsSL https://raw.githubusercontent.com/JayLLM/hoolix/main/install.sh | bash
```

Standalone binary (Windows):
```powershell
iwr -useb https://raw.githubusercontent.com/JayLLM/hoolix/main/install.ps1 | iex
```

---

## Versioning (Semantic Versioning)

Hoolix follows [Semantic Versioning](https://semver.org) `MAJOR.MINOR.PATCH`:

| Change type | Version bump |
|---|---|
| Breaking change to stable CLI or data format | **MAJOR** |
| New command, new template, new flag | **MINOR** |
| Bug fix, performance, or non-breaking behaviour | **PATCH** |

Pre-releases (`0.0.1-beta.*`) carry **no stability guarantees**. Once v1.0.0 ships, the promises below apply.

---

## What is stable in v1.0

### CLI commands and flags
All commands listed in `hoolix --help` are considered **stable**. Their positional arguments, named flags, and exit codes will not change in a breaking way within a MAJOR version.

| Command | Stable? | Notes |
|---|---|---|
| `hoolix create / install` | ✅ | Positional syntax and flag names locked |
| `hoolix list / info / delete` | ✅ | Output columns stable in human mode; `--json` schema stable |
| `hoolix start / stop` | ✅ | `--proxy` flag and HTTP config format stable |
| `hoolix connect` | ✅ | Per-client config format follows official MCP client schemas |
| `hoolix secrets *` | ✅ | |
| `hoolix export / import` | ✅ | Bundle format `version: 2` stable |
| `hoolix bundle export/import` | ✅ | Multi-server bundle format `version: 1` stable |
| `hoolix templates *` | ✅ | |
| `hoolix completion` | ✅ | Script output may improve; sourcing pattern unchanged |
| `hoolix doctor` | ✅ | Check names stable; JSON keys stable |
| `hoolix stats / audit` | ✅ | |
| `hoolix rotate` | ✅ | |
| `hoolix gui` | ✅ | Web dashboard local-only; no auth changes without notice |
| `hoolix update / uninstall` | ✅ | |
| `hoolix trial` | ✅ | Template used may change; flags stable |

### JSON output (`--json`)
When `--json` is passed, the top-level object shape is **stable**. New keys may be added (non-breaking). Keys will not be removed or renamed within a MAJOR version.

### Data files on disk
| File | Path | Stability |
|---|---|---|
| `metadata.json` | `~/.local/share/hoolix/servers/<slug>/` | Stable — new keys may be added |
| `credentials.json` | Same directory, mode 0600 | Stable |
| `.runtime.json` | Same directory | Stable (new keys may be added) |
| `audit.log` | Same directory | Newline-delimited JSON; schema stable |
| `chunks.json` | `data/` subdirectory | Stable |
| Bundle format | `.hoolix.json` | `version: 2` (single) and `version: 1` (multi) stable |

### Template IDs
Official template IDs (e.g. `filesystem`, `github-api`, `postgres`) will not be removed or renamed in a MINOR bump. New templates are always additive.

---

## What may change (no stability promise)

| Area | Status |
|---|---|
| TUI layout and key bindings | **Unstable** — may change in any MINOR |
| Internal `__internal-host` / `__internal-proxy` flags | **Internal** — never call directly |
| Web GUI (`hoolix gui`) API routes | **Unstable** until v1.1 |
| Community template format | Stable schema; directory path may change before v1.0 |
| SSE streaming in proxy mode | Phase 1 only; full SSE streaming is planned for a future MINOR |
| `hoolix verify` scoring rubric | May improve; exact scores may change |

---

## Upgrade policy

- **PATCH** → safe to upgrade immediately; no action needed.
- **MINOR** → safe to upgrade; new features available. Read the CHANGELOG.
- **MAJOR** → migration guide published with the release. Existing data files are migrated automatically where possible; breaking CLI changes are listed explicitly.

---

## Long-term support (LTS)

v1.x will receive security fixes for a minimum of **24 months** after release. v2.0 will be announced with at least 6 months notice.

---

## Filing stability issues

If you find a behaviour that violates these promises (a command flag removed, a JSON key renamed, a data file broken), please [open an issue](https://github.com/JayLLM/hoolix/issues) with the label `stability`.
