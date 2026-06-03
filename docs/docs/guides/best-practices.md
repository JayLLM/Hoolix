---
sidebar_label: Best Practices
sidebar_position: 6
---

# Best Practices

- Always run `hoolix verify <slug>` after create or reindex before wiring a client.
- Prefer `llms-full.txt` sources when available.
- Use descriptive human names; the slug is derived automatically.
- Protect the user data directory (contains auth keys).
- For large sites, start with a smaller `--url` pointing at a specific section's llms if possible, then expand.
- Reindex regularly as part of doc-site release process.
- Use `hoolix doctor --json` in CI or install verification scripts.
- Never paste auth keys into tickets, PRs, or public logs.
- For Windows users: the `.cmd` handling and ps-list are there for a reason — report spawn issues with full `doctor` output.

## Grounding Quality Checklist (for verify output)

- [ ] Every sample hit shows a `Source: https://...` line
- [ ] The URL in Source is a real page, not the llms.txt manifest itself
- [ ] Content looks relevant to the query term
- [ ] Table of Contents has more than a couple of entries and the top-level titles match the site

## See Also

- [FAQ](../faq/common-issues)
- [Contributing](../contributing/development-setup)
