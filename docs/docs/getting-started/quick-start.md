---
sidebar_label: Quick Start
sidebar_position: 2
---

# Quick Start

Hoolix turns docs, repos, and templates into grounded MCP servers. The fastest way to learn it is the TUI.

## 1. Open Hoolix

```bash
hoolix
```

Running `hoolix` with no arguments opens the terminal dashboard. From the TUI you can create servers, launch a trial, browse templates, start and stop servers, verify retrieval quality, copy client config, reindex, and inspect logs.

If you are in CI or a non-interactive terminal, Hoolix prints CLI help instead.

## 2. Create A Trial Server

```bash
hoolix trial
```

The trial server uses known-good public sources and is perfect for a first run, a demo, or testing `npx hoolix trial`.

Verify it:

```bash
hoolix verify hoolix-trial
```

Look for non-empty chunks, source URLs, and healthy sample searches.

## 3. Start The MCP Host

```bash
hoolix start hoolix-trial
```

By default this starts authenticated Streamable HTTP hosting and prints the MCP client configuration. Hoolix also supports stdio:

```bash
hoolix start hoolix-trial --transport stdio --json
```

Use stdio when your client prefers a local command transport. Use HTTP when you want a running local endpoint.

## 4. Connect A Client

```bash
hoolix connect hoolix-trial --client cursor
```

`connect` can auto-merge Hoolix into supported client config files, create backups, copy config to your clipboard, and print client-specific restart steps. Supported targets include Cursor, Claude Desktop, Windsurf, Continue, Cline, Grok Build, and generic JSON.

Try this prompt in your client:

```text
Use search_documentation to find installation instructions and cite the source URL.
```

## 5. Create Your Own Server

### Single Source

```bash
hoolix create "React Docs" --url https://react.dev/llms.txt --yes
hoolix verify react-docs
```

### Multi-Source

```bash
hoolix create "Frontend Stack" \
  --source docs:https://react.dev/llms.txt \
  --source github:vercel/next.js \
  --yes
```

### Template

```bash
hoolix templates list
hoolix create "Terraform AWS" --template terraform-aws-docs --yes
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

## Helpful Next Commands

```bash
hoolix list
hoolix info react-docs
hoolix stats react-docs
hoolix reindex react-docs --schedule daily --yes
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
