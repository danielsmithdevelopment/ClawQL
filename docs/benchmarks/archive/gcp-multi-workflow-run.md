# GCP multi-spec workflow (archived run note)

**Script:** [`scripts/workflows/mcp-workflow-gcp-multi.mjs`](../../../scripts/workflows/mcp-workflow-gcp-multi.mjs)

**Run:**

```bash
npm run workflow:gcp-multi
```

**What it does:** drives the **ClawQL GCP multi-spec workflow** over MCP (`search` against the merged Google top-50 corpus), printing ranked hits per scripted query (service usage, IAM, GKE, DNS, etc.).

**Original capture:** full stdout was previously committed as repo-root `gcp-multi-test.md` (npm **`clawql-mcp@1.0.0`** era). Use `git log --follow -- gcp-multi-test.md` if you need that log.
