---
sidebar_label: Quick Start
sidebar_position: 2
---

# Quick Start

Hoolix turns docs, repos, and templates into grounded MCP servers. The fastest way to learn it is the TUI.

## 1. Install and Open Hoolix

```bash
npm install -g hoolix
hoolix
```

Running `hoolix` with no arguments opens the terminal dashboard. From the TUI you can install templates, create servers, launch a trial, browse templates, start and stop servers, verify retrieval quality, copy client config, reindex, and inspect logs.

If you are in CI or a non-interactive terminal, Hoolix prints CLI help instead.

## 2. Install an MCP Server Template

Templates are curated, one-command installs for common tools:

```bash
# Filesystem access
hoolix install filesystem /Users/you/projects --yes

# GitHub API
hoolix install github-api --yes    # prompts for GITHUB_TOKEN

# Web search
hoolix install brave-search --yes  # prompts for BRAVE_API_KEY

# Database
hoolix install postgres --credential databaseUrl=postgresql://localhost/mydb --yes

# Memory / sequential thinking
hoolix install memory --yes
hoolix install sequential-thinking --yes
```

Browse all 14 official templates:

```bash
hoolix templates list
hoolix templates info brave-search
```

## 3. Create a Docs RAG Server

```bash
hoolix create "React Docs" --url https://react.dev/llms.txt --yes
hoolix verify react-docs
hoolix start react-docs
```

## 4. Connect a Client

```bash
hoolix connect react-docs --client cursor
hoolix connect my-github --client claude
hoolix connect my-files --client claude-code
```

`connect` auto-merges Hoolix into supported client config files, creates backups, copies config to your clipboard, and prints client-specific restart steps. Supported targets include Cursor, Claude Desktop, Claude Code, VS Code, Windsurf, Continue, Cline, Grok Build, and generic JSON.

Try this prompt in your client:

```text
Use search_documentation to find installation instructions and cite the source URL.
```

## 5. Create a Multi-Source Server

```bash
hoolix create "Frontend Stack" \
  --source docs:https://react.dev/llms.txt \
  --source github:vercel/next.js \
  --yes
```

## What Hoolix Created

Each server has:

- A slug, generated from the display name.
- A validated server definition with sources and optional template backing.
- A per-server auth key.
- Indexed chunks with source provenance.
- RAG search and page-read tools.
- Audit logs and usage stats.
- Reindex and export/import support.

## Shell Completions

Set up tab-completion for your shell:

```bash
eval "$(hoolix completion bash)"    # add to ~/.bashrc
eval "$(hoolix completion zsh)"     # add to ~/.zshrc
hoolix completion fish | source     # add to ~/.config/fish/config.fish
```

## Helpful Next Commands

```bash
hoolix list                          # see all servers with live status
hoolix info react-docs
hoolix stats react-docs
hoolix reindex react-docs --schedule daily --yes
hoolix bundle export my-docs my-github --output team.hoolix.json  # share with teammates
hoolix gui
hoolix doctor
```

## Next Steps

- Learn [how to create servers](../guides/creating-servers) from URLs, sources, templates, and private docs.
- Read the [CLI reference](../api-reference/cli) for flags and JSON output.
- Explore [reindexing and verify](../guides/reindexing-and-verify).
- Understand the [ingestion pipeline](../architecture/ingestion-pipeline).

:::tip
Run `hoolix doctor` any time you want to see paths, config, runtime status, source plugin discovery, and common setup issues.
:::
