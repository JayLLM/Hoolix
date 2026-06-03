---
sidebar_label: Fetch & Protection
sidebar_position: 3
---

# Fetch & Protection Issues

## Sites that 404 on node-fetch

Examples: docs.x.ai at the time of development.

**Mitigations in hoolix**:
- Only during root/primary discovery: try 3 UAs (hoolix, Chrome, curl)
- Send explicit `Accept: text/plain, text/markdown, */*`
- Retries with jitter
- `llms-full.txt` sibling probe before falling back

If a site still blocks, the generic HTML path may still work (Readability + Turndown), or you can download the llms file manually and point `--url` at a `file://` (not currently supported) or host a local copy.

## llms.txt Manifests Returning Wrong Content

Caused by sub-page fetches accidentally re-running discovery. Fixed by the `discoverLlms: false` flag passed from `fetchPagesConcurrently`.

## See Also

- [Multi-Page Guide](../guides/multi-page-llms)
- [Ingestion Pipeline](../architecture/ingestion-pipeline)
- `src/ingestion/fetchers.ts` (the UA array and guard)
