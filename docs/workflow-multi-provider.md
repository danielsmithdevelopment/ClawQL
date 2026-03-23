# Multi-provider workflow test (GKE + Cloudflare + Jira)

This repo includes an offline **search** workflow that walks the same scenario an agent would use across all three bundled providers:

1. **Google (GKE)** — create/manage clusters, deploy workloads, expose services, networking hints (bundled spec is **Kubernetes Engine API only**; Compute Engine firewall APIs are not in this spec—use `CLAWQL_SPEC_PATH` for a broader Google OpenAPI if needed).
2. **Cloudflare** — DNS records, proxy, cache rules, zone settings.
3. **Jira** — create issue, assign, labels, due date, create metadata.

## Run (offline)

```bash
npm run workflow:multi-provider
```

- Prints ranked `search` hits per step to stdout.
- Writes `docs/workflow-multi-provider-latest.json` with structured results and a **Jira draft** (summary, ADF description, labels `kubernetes`, `google`, `cloudflare`, due date = next Friday).

No API keys required.

## Create a real Jira issue (optional)

Jira Cloud needs a **project key**, **auth**, and an **assignee `accountId`** (not display name). Resolve `accountId` from the Jira UI or `GET /rest/api/3/user/search?query=danielsmith`.

```bash
export WORKFLOW_CREATE_JIRA_ISSUE=1
export CLAWQL_API_BASE_URL="https://YOURSITE.atlassian.net"
export CLAWQL_HTTP_HEADERS='{"Authorization":"Basic ..."}'   # or Bearer
export WORKFLOW_JIRA_PROJECT_KEY="PROJ"
export WORKFLOW_JIRA_ASSIGNEE_ACCOUNT_ID="5b10a2844c20165700ede21f"
# optional: WORKFLOW_JIRA_ISSUE_TYPE_NAME=Task
# optional: WORKFLOW_JIRA_LABELS="kubernetes,google,cloudflare"

npm run workflow:multi-provider
```

If `issuetype` by name fails, set `WORKFLOW_JIRA_ISSUE_TYPE_NAME` to match your project, or use `createmeta` to pick an `id`.

## What this does *not* do

- It does **not** call Google Cloud or Cloudflare APIs automatically (no cluster creation, no DNS changes).
- It **does** validate that ClawQL’s `search` pipeline returns sensible operations for each intent on each bundled spec.
