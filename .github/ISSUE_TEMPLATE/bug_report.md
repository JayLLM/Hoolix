---
name: Bug report
about: Report a bug in Hoolix
title: ''
labels: bug
assignees: ''
---

**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. `hoolix create ...`
2. `hoolix start ...`
3. ...

If this involves a gateway, profile, approval, or MCP client, include the exact `gateway`,
`profile`, and `connect --client ...` commands you used.

**Expected behavior**
What you expected to happen.

**Actual behavior / logs**
Paste output, error, or relevant `hoolix doctor --json` + host.log / gateway.log tail.
Remove tokens, API keys, Authorization headers, and private repository names if needed.

**Environment**
- OS + version (e.g. Windows 11, macOS 15, Ubuntu 24.04)
- Binary or `bunx` / `npx`?
- `hoolix --version`
- `hoolix doctor --json` (sanitized)
- MCP client and version, if applicable (Codex, Claude Code, Cursor, VS Code, Grok Build, etc.)

**Additional context**
Screenshots, specific docs URL (public only), client used (Cursor etc).

**Checklist**
- [ ] I ran `hoolix doctor`
- [ ] I tried `reindex`
- [ ] I searched existing issues
- [ ] I removed secrets from logs and screenshots
