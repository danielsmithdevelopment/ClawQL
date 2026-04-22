# Multi-provider workflow test (GKE + Cloudflare + Jira)

This repo includes an offline **search** workflow that walks the same scenario an agent would use across **Google Cloud (bundled manifest)**, **Cloudflare**, and **Jira** — the script loads each provider in **single-spec** mode (`CLAWQL_PROVIDER=google` / `cloudflare` / `jira` in turn), not the merged default bundle.

1. **Google Cloud (bundled)** — GKE, Compute (firewall), networking, and other curated GCP APIs from [`google-top50-apis.json`](../providers/google/google-top50-apis.json) (on-disk manifest name; **`CLAWQL_PROVIDER=google`**).
2. **Cloudflare** — DNS records, proxy, cache rules, zone settings.
3. **Jira** — create issue, assign, labels, due date, create metadata.

**Default merged install** (no spec env) is **Google Cloud (bundled) + Cloudflare + GitHub + Slack + Paperless + Stirling + Tika + Gotenberg** — see [`providers/README.md`](../providers/README.md).

**Broader merge (all bundled vendors):** use **`CLAWQL_PROVIDER=all-providers`** and see [`workflow-complex-release-stack.md`](workflow-complex-release-stack.md) / `npm run workflow:complex-release-stack`.

## Run (offline)

```bash
npm run workflow:multi-provider
```

- Prints ranked `search` hits per step to stdout.
- Writes `docs/workflow-multi-provider-latest.json` with structured results and a **Jira draft** (summary, ADF description, labels `kubernetes`, `google`, `cloudflare`, due date = next Friday).

No API keys required.

## Create a real Jira issue (optional)

Jira live issue creation is temporarily undocumented while credential strategy is being finalized.

## What this does _not_ do

- It does **not** call Google Cloud or Cloudflare APIs automatically (no cluster creation, no DNS changes).
- It **does** validate that ClawQL’s `search` pipeline returns sensible operations for each intent on each bundled spec.
