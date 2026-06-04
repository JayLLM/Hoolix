---
sidebar_label: Installation
sidebar_position: 1
---

# Installation

Hoolix can be installed as a prebuilt native binary (recommended) or run through npm / bun for quick trials.

## Recommended: Prebuilt Binary (Windows, macOS, Linux)

Use the official installers. They download the latest matching release asset, place the binary in a user-writable location, and update PATH where possible.

During beta, `latest` includes prerelease builds such as `v0.0.1-beta.0`. Use `-Stable` / `--stable` to ignore prereleases once stable releases exist.

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/JayLLM/hoolix/main/install.ps1 | iex

# Windows with options
irm https://raw.githubusercontent.com/JayLLM/hoolix/main/install.ps1 -OutFile install.ps1
.\install.ps1 -Version v0.0.1-beta.0
.\install.ps1 -Stable
```

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/JayLLM/hoolix/main/install.sh | bash

# macOS / Linux with options
curl -fsSL https://raw.githubusercontent.com/JayLLM/hoolix/main/install.sh | bash -s -- --version v0.0.1-beta.0
curl -fsSL https://raw.githubusercontent.com/JayLLM/hoolix/main/install.sh | bash -s -- --stable
```

After install, verify:

```bash
hoolix --version
hoolix doctor
```

## Alternative: npm / bun / bunx (no global binary)

```bash
# One-click demo without installing
npx hoolix trial
bunx hoolix trial

# Global via npm or bun
npm install -g hoolix
bun install -g hoolix
```

For daily use, the prebuilt binary is still the best path because `hoolix start <slug>` and the default TUI work without needing source files or a runtime.

## From Source (developers)

```bash
git clone https://github.com/JayLLM/hoolix.git
cd hoolix
bun install
bun run build
```

See [Contributing](../contributing/development-setup) for full dev setup including binary builds.

## Post-Install Verification

```bash
hoolix doctor --json   # machine readable
hoolix --help
hoolix
```

:::tip
The first `create` or `trial` downloads source content and may take 10-120 seconds depending on site size. Subsequent starts are fast.
:::

## See Also

- [Quick Start](./quick-start)
- [Basic Usage](./basic-usage)
- [FAQ & Troubleshooting](../faq/common-issues)
