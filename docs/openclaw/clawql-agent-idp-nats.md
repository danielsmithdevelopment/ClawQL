# ClawQL-Agent ↔ IDP NATS contract ([#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128))

**Boundary:** Interactive agent loops may run in **Hermes**, **Pi**, Goose, OpenClaw, or an external ClawQL-Agent repo. **ClawQL** owns MCP tools, JetStream subject conventions, Helm workers, and the **`nats:agent-bridge`** process that closes async document events into MCP (`memory_ingest` / `notify`). This page is the contract so agents do not invent parallel queues.

## Subjects (document bus)

| Subject                                          | Publisher                             | Consumer (ClawQL)                          | Agent expectation                                                      |
| ------------------------------------------------ | ------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `clawql.document.inbox.arrived`                  | MCP Nextcloud webhook / Agent publish | `clawql-idp-pipeline` → `run_idp_pipeline` | Prefer webhook or MCP publish; do **not** reimplement the hop runner   |
| `clawql.document.pipeline.requested`             | MCP / Agent                           | `clawql-idp-pipeline-requested`            | Explicit re-run with optional `dry_run`                                |
| `clawql.document.pipeline.hop`                   | Pipeline runner                       | (observe)                                  | Progress / dashboard                                                   |
| `clawql.document.pipeline.completed` / `.failed` | Pipeline runner                       | (observe)                                  | Terminal for Agent graphs                                              |
| `clawql.document.coneshare.viewer`               | ConeShare webhook                     | `clawql-coneshare-followup`                | Resume / Slack already handled; Agent may also subscribe for CRM tasks |

Envelope: `schema_version: 1`, `event_type`, `subject`, `correlation_id`, optional `workflow_ref`, `payload` — see `packages/clawql-automation/src/nats/envelope.ts`.

## MCP tools Agents should call

| Goal                | Tool                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Plan / run IDP hops | `run_idp_pipeline` (`CLAWQL_ENABLE_IDP_PIPELINE=1`)                                                                 |
| Vendor ops          | `search` + `execute` (Stirling, Nextcloud, Docling, …)                                                              |
| HITL                | `hitl_enqueue_label_studio` + `workflow` suspend/resume                                                             |
| GitOps promote      | `sandbox_exec` → GitHub `execute` → `argocd` — [agent-pr-argocd-pipeline.md](../gitops/agent-pr-argocd-pipeline.md) |
| Memory / audit      | `memory_ingest`, `audit` with shared `correlation_id`                                                               |

## What not to duplicate in Agent

1. **Do not** embed Stirling/Presidio/Privacy Filter chains — call ClawQL MCP or rely on NATS workers.
2. **Do not** invent a second queue for Nextcloud inbox — publish `inbox.arrived` or POST `/idp/nextcloud/webhook`.
3. **Do not** auto-merge production GitOps — PR + human review ([#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258)).

## Acceptance for #128 (ClawQL side)

- [x] Document JetStream subjects + durables shipped (NATS IDP consumers)
- [x] Operator enablement runbook: [nats-idp-e2e.md](../runbooks/nats-idp-e2e.md)
- [x] This contract linked from Agent PR / OpenClaw IDP docs
- [x] Subscribe/publish **agent bridge** in-repo: `npm run nats:agent-bridge` + Hermes/Pi samples ([idp-nats-agent](../../deployment/samples/idp-nats-agent/README.md), [idp-nats-agent-bridge.md](../runbooks/idp-nats-agent-bridge.md))
- [ ] Optional: external ClawQL-Agent LangGraph repo may wrap the same subjects (not required for Hermes/Pi)

## Related

- [idp-nats-agent-bridge.md](../runbooks/idp-nats-agent-bridge.md)
- [nats-keda-worker.md](../deployment/nats-keda-worker.md)
- [Slack-first IDP runbook](slack-first-idp-runbook.md)
- [OpenClaw IDP skill profile](openclaw-idp-skill-profile.md)
