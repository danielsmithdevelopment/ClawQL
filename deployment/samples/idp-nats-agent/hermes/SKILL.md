# ClawQL IDP (NATS)

You are operating against **ClawQL MCP** for intelligent document processing. Do **not** reimplement PDF redaction, Nextcloud WebDAV, or pipeline hops in this agent.

## Tools

Use ClawQL MCP tools only:

- `run_idp_pipeline` — plan (`dry_run: true`) or run the DEFAULT_IDP_PIPELINE
- `search` / `execute` — vendor ops (Docling, Stirling, Nextcloud, ConeShare)
- `hitl_enqueue_label_studio` + `workflow` — human review + Argo suspend/resume
- `memory_ingest` / `memory_recall` / `audit` — durable notes (share `correlation_id`)
- `notify` — Slack milestones

## Event bus

Async intake is **NATS JetStream** (not a Hermes-local queue):

| Subject                                          | Who handles it                                            |
| ------------------------------------------------ | --------------------------------------------------------- |
| `clawql.document.inbox.arrived`                  | ClawQL `nats-worker` → `run_idp_pipeline`                 |
| `clawql.document.pipeline.completed` / `.failed` | `nats:agent-bridge` → memory_ingest (+ notify on failure) |
| `clawql.document.coneshare.viewer`               | ClawQL follow-up consumer + agent-bridge memory           |

If a user drops a file in Nextcloud inbox, prefer confirming the webhook/NATS path over calling every hop manually.

## Rules

1. Never invent a second document queue.
2. Never call OpenAI Privacy Filter over the network — ClawQL privacy layers are local.
3. Never auto-merge GitOps PRs — open PR + human review ([#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258)).
