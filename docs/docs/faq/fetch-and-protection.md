---
sidebar_label: Fetch & Protection
sidebar_position: 3
---

# Fetch And Protection Issues

Some documentation sites are easy to ingest. Others use bot protection, private sessions, unusual redirects, or GitHub rate limits. Hoolix includes several resilience paths, and the CLI should tell you what to try next.

## Protected Documentation

Use headers or cookies:

```bash
hoolix create "Private Docs" \
  --url https://docs.example.com/llms.txt \
  --header "Authorization: Bearer $DOCS_TOKEN" \
  --cookie "session=$DOCS_SESSION" \
  --yes
```

These auth hints are stored in the server definition so reindex can use them later.

## Private GitHub Repositories

Set `GITHUB_TOKEN` before create or reindex:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
hoolix create "Private Repo" --source github:org/private-repo --yes
```

Use a classic token with `repo` scope or a fine-grained token with contents read access.

## Sites That Block Fetches

Hoolix tries:

- `llms-full.txt` and `llms.txt` discovery.
- User-agent rotation.
- Markdown-friendly Accept headers.
- Retries with backoff.
- Curl fallback.
- HTML readability conversion when Markdown is not available.

If the site still blocks access:

- Prefer a direct `llms.txt` or `llms-full.txt` URL.
- Add the headers or cookies your browser session uses.
- Use a GitHub source when docs are mirrored in a repo.
- Create a custom source plugin that maps an internal identifier to an accessible URL.

## Multi-Page llms.txt Manifests

When `llms.txt` is a manifest, Hoolix fetches linked pages and disables recursive discovery on sub-pages. This keeps each chunk grounded to the real page URL instead of the manifest URL.

## Diagnosing

```bash
hoolix doctor
hoolix verify <slug>
hoolix reindex <slug> --force --yes
```

`doctor` surfaces environment, path, runtime, and plugin discovery issues. `verify` shows source and grounding health. `reindex --force` is useful after fixing credentials.

## Team Export Safety

Private source auth can be sensitive. Prefer:

```bash
hoolix export my-docs --team --strip-key --file my-docs.hoolix.json
```

Only add `--include-source-auth` for trusted destinations.

## SSRF Protection

Hoolix validates every outbound URL before making a network connection during ingestion and self-update. The SSRF guard rejects:

- Non-http/https schemes (`ftp://`, `file://`, etc.)
- Cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`, `metadata.azure.com`, etc.)
- RFC 1918 private IPs (`10.x`, `172.16–31.x`, `192.168.x`), loopback (`127.x`, `::1`), link-local (`169.254.x`), and carrier-grade NAT (`100.64–127.x`)
- Hostnames that resolve via DNS to any of the above

This prevents a malicious documentation URL from being used to probe internal services, cloud instance metadata, or loopback addresses.

The curl fallback additionally passes `--proto =https,http --proto-redir =https,http` to prevent scheme-downgrade attacks via redirects.

If a legitimate internal documentation server is being blocked, the URL must be explicitly reachable over a public or VPN-routed address.

## Update Integrity

`hoolix update` downloads the new binary and verifies its SHA-256 hash against the `SHA256SUMS` file attached to the GitHub Release before applying the update. If `SHA256SUMS` is missing or does not contain an entry for the platform binary, the update is **rejected** (fail-closed). A hash mismatch also aborts the update.

Pass `--no-verify` to skip checksum verification (not recommended outside air-gapped environments).

## See Also

- [Creating Servers](../guides/creating-servers)
- [Ingestion Pipeline](../architecture/ingestion-pipeline)
- [CLI Reference](../api-reference/cli)
- [THREAT_MODEL.md](https://github.com/JayLLM/hoolix/blob/main/THREAT_MODEL.md)
