# Multi-provider workflow (archived run note)

**Script:** [`scripts/workflow-gke-cloudflare-jira.mjs`](../../../scripts/workflow-gke-cloudflare-jira.mjs)

**Run:**

```bash
npm run workflow:multi-provider
```

**What it does:** offline workflow across **Google (top 50 merged)** + **Cloudflare** + **Jira** bundled specs: loads providers, runs scripted `search` steps, emits ranked operations (full terminal log was large).

**Planning-context benchmark:** token/spec vs workflow-output sizes are recorded in [`../multi-provider-complex-workflow/experiment-multi-provider-complex-workflow-stats.json`](../multi-provider-complex-workflow/experiment-multi-provider-complex-workflow-stats.json) and [`../multi-provider-complex-workflow/experiment-multi-provider-complex-workflow.md`](../multi-provider-complex-workflow/experiment-multi-provider-complex-workflow.md). The **`workflowOutput.bytes`** / **`approxTokens`** there refer to the **historical** full stdout capture (formerly repo-root `multi-provider-test.md`), not this summary file.

**Regenerate a full capture** (overwrites a local file—do not commit without trimming):

```bash
npm run workflow:multi-provider > docs/benchmarks/archive/multi-provider-workflow-capture.txt 2>&1
```
