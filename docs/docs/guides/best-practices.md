---
sidebar_label: Best Practices
sidebar_position: 6
---

# Best Practices

## First Server

- Start with `hoolix` and use the TUI if you are exploring.
- Use `hoolix trial` when you want a known-good demo.
- Prefer `llms-full.txt` or `llms.txt` sources when available.
- Use templates when a curated starting point exists.

## Source Quality

- Use multi-source servers when agents naturally need docs plus repository context.
- Keep sources focused enough that results stay relevant.
- Use `--header`, `--cookie`, or `GITHUB_TOKEN` for private content instead of copying private docs into public locations.
- Use source plugins for repeatable internal source patterns.

## Verification

Always run:

```bash
hoolix verify <slug>
```

Check that:

- Sample hits are relevant.
- Every useful result has a source URL.
- Source labels make sense for multi-source servers.
- TOC entries look like the source structure.
- Hybrid mode is actually helping before making it the default for a server.

## Operations

- Reindex after documentation releases.
- Add schedules for servers that change often.
- Use `hoolix stats` to understand what agents ask.
- Use `hoolix audit` for security and debugging.
- Rotate keys after sharing mistakes or team changes.

## Sharing

Prefer team-safe bundles:

```bash
hoolix export my-docs --team --strip-key --file my-docs.hoolix.json
```

Include keys or source auth only for private backups and trusted destinations.

## Security

- Protect the Hoolix data directory.
- Avoid screenshots with full keys.
- Do not commit `.hoolix.json` bundles unless they are intentionally stripped.
- Restart clients after `connect` or `rotate`.

## See Also

- [Creating Servers](./creating-servers)
- [Authentication](./authentication)
- [Reindexing and Verify](./reindexing-and-verify)
