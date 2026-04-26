# Complex release-stack workflow (all bundled vendors)

End-to-end **search** exercise using the merged preset **`CLAWQL_PROVIDER=all-providers`**: **Google top50** plus **every other** entry in `BUNDLED_PROVIDERS` (Jira, Bitbucket, Cloudflare, GitHub, Slack, Sentry, n8n — new vendors are included automatically when registered).

| Phase            | Provider       | Intent                                                           |
| ---------------- | -------------- | ---------------------------------------------------------------- |
| Cluster & deploy | Google (top50) | GKE cluster, workloads, Service exposure                         |
| Ingress lockdown | Google (top50) | Firewall / NEG patterns toward Cloudflare IP ranges              |
| Edge             | Cloudflare     | DNS to origin, caching / cache rules                             |
| Observability    | Sentry         | Projects, DSN, releases tied to deploys                          |
| CI/CD            | GitHub Actions | Scheduled workflows, secrets, deploy hooks                       |
| Comms            | Slack          | `chat.postMessage` to a release channel per step                 |
| Automation       | n8n            | Workflow: Slack → create GitHub release                          |
| SCM (optional)   | Bitbucket      | Repos / Pipelines mirror to the same story                       |
| Tracking         | Jira           | One ticket, sections by tool, labels, due +7 days, High priority |

## Run (offline `search` only)

```bash
npm run workflow:complex-release-stack
```

The script sets **`CLAWQL_PROVIDER=all-providers`** internally (one merged load: Google top50 + all other bundled vendors). To use the same bundle in MCP or other tools:

```bash
export CLAWQL_PROVIDER=all-providers
```

Writes `docs/workflows/workflow-complex-release-stack-latest.json` (full steps, ranked hits, Jira draft).

## Jira preview or create

Dry-run (show POST body; optional missing-config hints):

```bash
WORKFLOW_PREVIEW_JIRA_REQUEST=1 npm run workflow:complex-release-stack
```

Live create (same env vars as `workflow:multi-provider`; assignee needs Jira Cloud **accountId**):

```bash
WORKFLOW_CREATE_JIRA_ISSUE=1 \
CLAWQL_API_BASE_URL=https://YOURSITE.atlassian.net \
CLAWQL_HTTP_HEADERS='{"Authorization":"Basic ..."}' \
WORKFLOW_JIRA_PROJECT_KEY=PROJ \
WORKFLOW_JIRA_ASSIGNEE_ACCOUNT_ID=YOUR_ACCOUNT_ID \
npm run workflow:complex-release-stack
```

Display name in the ticket description defaults to **Daniel Smith**; override with `WORKFLOW_JIRA_ASSIGNEE_DISPLAY_NAME`.

## What this does _not_ do

It does **not** provision infrastructure or call third-party APIs except optional Jira `POST /rest/api/3/issue`. It validates that ClawQL `search` returns plausible operations for each natural-language step against the **merged** spec set (REST `execute` in this mode routes per operation’s source spec).

**See also:** [`providers/README.md`](../providers/README.md) (merged presets), [`README.md`](../README.md) (precedence for `CLAWQL_SPEC_PATHS`, `CLAWQL_BUNDLED_PROVIDERS`, `CLAWQL_PROVIDER`, and the built-in `all-providers` default).
