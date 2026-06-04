---
sidebar_label: Installation
sidebar_position: 1
---

# Installation

Hoolix can be installed as an npm global package (recommended), a prebuilt native binary, or run ephemerally with `npx`.

## Recommended: npm

```bash
npm install -g hoolix
```

The npm package is published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements) — the cryptographic chain from source code to published package is publicly verifiable on npmjs.com.

**Beta / pre-release:**
```bash
npm install -g hoolix@next
```

After install, verify and open the TUI:
```bash
hoolix doctor
hoolix
```

## Shell Completions (optional but great)

After installing, add tab-completion for your shell:

```bash
# bash  — add to ~/.bashrc
eval "$(hoolix completion bash)"

# zsh   — add to ~/.zshrc
eval "$(hoolix completion zsh)"

# fish  — add to ~/.config/fish/config.fish
hoolix completion fish | source

# PowerShell — add to $PROFILE
hoolix completion powershell | Invoke-Expression
```

## Alternative: Standalone Binary

Self-contained binaries include the Bun runtime. No Node.js or npm required on the target machine.

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/JayLLM/hoolix/main/install.sh | bash

# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/JayLLM/hoolix/main/install.ps1 | iex
```

The installer:
- Detects OS and architecture automatically.
- Downloads the matching binary from GitHub Releases.
- Verifies the SHA-256 checksum against `SHA256SUMS`.
- Adds the binary to your PATH.

**Manual checksum verification:**
```bash
# Linux
sha256sum --check SHA256SUMS

# macOS
shasum -a 256 -c SHA256SUMS
```

Download `SHA256SUMS` from [GitHub Releases](https://github.com/JayLLM/hoolix/releases).

## One-Off / Try Without Installing

```bash
npx hoolix trial
```

Great for demos and quick evaluations. For daily use, the npm global install is the better path.

## From Source (Developers)

```bash
git clone https://github.com/JayLLM/hoolix.git
cd hoolix
bun install
bun run dev     # runs from source via tsx
```

To build a native binary locally:
```bash
bun run build:binary
./dist-bin/hoolix doctor
```

See [Contributing](../contributing/development-setup) for full dev setup.

## Post-Install Verification

```bash
hoolix doctor          # checks runtime, paths, config, templates, and proxy status
hoolix doctor --json   # machine-readable output
hoolix --help
hoolix                 # opens the TUI
```

:::tip
Run `hoolix doctor` any time you want to confirm the installation, check data paths, or see which servers are currently running.
:::

:::info
The first `hoolix install <template>` or `hoolix create` downloads source content. Subsequent starts are fast because the index is cached locally.
:::

## See Also

- [Quick Start](./quick-start)
- [Basic Usage](./basic-usage)
- [FAQ & Troubleshooting](../faq/common-issues)
