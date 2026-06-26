# IDP master requirements matrix (ClawQL + OpenClaw)

**Purpose:** Map the **long-term intelligent document processing (IDP)** vision (local-first, agentic, observable, GitOps-ready) to **shipped code**, **GitHub issues**, and **explicit gaps**. Use this with [OpenClaw IDP skill profile](../openclaw/openclaw-idp-skill-profile.md) and [gap closure plan (prioritized)](gap-closure-plan-prioritized-2026.md).

**Product vision canon:** [`docs/vision/clawql-master-enablement-guide.md`](../vision/clawql-master-enablement-guide.md) (companions: modularization v1.9 / v2.0). **Stack narrative (April 2026):** [`clawql-idp-stack.md`](../vision/clawql-idp-stack.md) — IDP components, defense-in-depth redaction, orchestration planes.

**Epic (checklist only, no extra scope):** [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259) — rolls up **#241–#258**.

**Last updated:** 2026-06-26

---

## Legend

| Symbol       | Meaning                                  |
| ------------ | ---------------------------------------- |
| **Shipped**  | In `main` with docs                      |
| **Partial**  | Some paths exist; issue tracks remainder |
| **Issue #n** | Tracking issue                           |

---

## Stack vs tracking

| Master reference area | Requirement                                                                     | Status                    | Primary tracking                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ingestion**         | Tika, Gotenberg, Stirling, Paperless, Onyx, Nextcloud, Coneshare (Helm + specs) | **Shipped**               | [`idp-pipeline.md`](../providers/idp-pipeline.md), [IDP profile](../openclaw/openclaw-idp-skill-profile.md)                                                                                                                     |
| **Ingestion**         | **`clawql-documents` automated pipeline runner** (Merkle, hooks, retries)       | **Gap**                   | [`clawql-idp-stack.md`](../vision/clawql-idp-stack.md) §3, [#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307) — **`DEFAULT_IDP_PIPELINE` recipe shipped**                                                      |
| **Ingestion**         | Introspection refresh for all doc providers                                     | **Partial**               | [#125](https://github.com/danielsmithdevelopment/ClawQL/issues/125)                                                                                                                                                             |
| **Privacy**           | **Stirling-PDF document redaction** (upstream of agents)                        | **Partial**               | Helm + Stirling provider; orchestration in **`clawql-documents`** gap; [`clawql-idp-stack.md`](../vision/clawql-idp-stack.md) §11.1                                                                                             |
| **Privacy**           | **Presidio agent I/O redaction** (MCP/Panguard gateway)                         | **Partial**               | Panguard vision, enablement guide; [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245) (sparse-MoE adjacency); [`clawql-idp-stack.md`](../vision/clawql-idp-stack.md) §11.1                                     |
| **Privacy**           | Local sparse-MoE mask before extraction                                         | **Partial**               | [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245)                                                                                                                                                             |
| **Extraction**        | LangExtract (schema + char grounding + HTML viz)                                | **Partial**               | [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)                                                                                                                                                             |
| **Classification**    | Docling MCP + fine-tuned classifier                                             | **Partial**               | [#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)                                                                                                                                                             |
| **HITL**              | Label Studio enqueue + webhook                                                  | **Shipped**               | [#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)                                                                                                                                                             |
| **HITL**              | Pre-annotations + vertical Label Studio packs                                   | **Partial**               | [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247)                                                                                                                                                             |
| **HITL**              | Multi-reviewer RBAC (CE vs enterprise)                                          | **Partial**               | [#249](https://github.com/danielsmithdevelopment/ClawQL/issues/249)                                                                                                                                                             |
| **Orchestration**     | Ouroboros MCP (5-phase evolutionary loop)                                       | **Shipped**               | [ADR 0001](../adr/0001-ouroboros-workflow-engine.md), [#110](https://github.com/danielsmithdevelopment/ClawQL/issues/110)                                                                                                       |
| **Orchestration**     | MCP `workflow` + Argo Workflows                                                 | **Planned**               | [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243), [ADR 0004](../adr/0004-argo-cd-workflows-clawql-pipelines.md)                                                                                              |
| **Orchestration**     | Argo CD GitOps                                                                  | **Planned**               | [#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)                                                                                                                                                             |
| **Orchestration**     | Argo **suspend** → HITL → **resume** + optional NATS                            | **Gap**                   | [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)                                                                                                                                                             |
| **Orchestration**     | LangGraph / ClawQL-Agent runtime                                                | **Outside repo**          | [ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent); coordinate via [#256](https://github.com/danielsmithdevelopment/ClawQL/issues/256), [#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258) |
| **Storage**           | **Nextcloud** collaboration + WebDAV intake                                     | **Ready**                 | Bundled provider `nextcloud` + Helm `idpCollaboration.nextcloud` — [`docs/providers/nextcloud-onboarding.md`](../providers/nextcloud-onboarding.md)                                                                             |
| **Storage**           | Nextcloud → pipeline mount / processed output sync                              | **Partial**               | `DEFAULT_IDP_PIPELINE` in **`clawql-documents`**; full automated orchestration still **`clawql-documents`** roadmap ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307))                                       |
| **Sharing**           | **Coneshare** VDR / secure links on Nextcloud storage                           | **Ready**                 | Bundled provider `coneshare` + webhook **`POST /idp/coneshare/webhook`** — [`docs/providers/coneshare-onboarding.md`](../providers/coneshare-onboarding.md)                                                                     |
| **Sharing**           | Coneshare viewer analytics → agent follow-up                                    | **Partial**               | Webhook → vault/audit shipped; Ouroboros/NATS resume ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)) still open                                                                                           |
| **Memory / RAG**      | Obsidian vault MCP                                                              | **Shipped**               | `memory_*` tools                                                                                                                                                                                                                |
| **Memory / RAG**      | Onyx knowledge                                                                  | **Shipped**               | [#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118) area                                                                                                                                                        |
| **Memory / RAG**      | Post-Paperless → Onyx automation                                                | **Partial**               | [#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)                                                                                                                                                             |
| **Evolution**         | Langfuse eval → seed updates                                                    | **Partial**               | [#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)                                                                                                                                                             |
| **Secrets**           | Vault default for provider keys                                                 | **Gap**                   | [#241](https://github.com/danielsmithdevelopment/ClawQL/issues/241), [#242](https://github.com/danielsmithdevelopment/ClawQL/issues/242)                                                                                        |
| **Events**            | NATS JetStream (Helm + conventions)                                             | **Partial**               | [#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127); app-level consumers evolve with [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)                                                        |
| **Observability**     | ClawQL `/metrics` + Grafana                                                     | **Shipped** / **Partial** | [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)                                                                                                                                                             |
| **Observability**     | Langfuse + IDP dashboards + trace story                                         | **Gap**                   | [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252)                                                                                                                                                             |
| **Observability**     | Jaeger vs Tempo (lab vs prod IDP)                                               | **Documented choice**     | [ADR 0003](../adr/0003-tempo-dragonfly-local-operations.md); folded into [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252)                                                                                    |
| **Deployment**        | Lean Helm `clawql-mcp`                                                          | **Shipped**               | `charts/clawql-mcp`                                                                                                                                                                                                             |
| **Deployment**        | Optional **clawql-idp** umbrella chart                                          | **Gap**                   | [#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)                                                                                                                                                             |
| **Deployment**        | Four vertical **Docker Compose** stacks                                         | **Gap**                   | [#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)                                                                                                                                                             |
| **Deployment**        | KEDA on NATS queue lag                                                          | **Gap**                   | [#257](https://github.com/danielsmithdevelopment/ClawQL/issues/257)                                                                                                                                                             |
| **OpenClaw**          | Install + MCP bootstrap                                                         | **Shipped**               | [#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226), [#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227)                                                                                        |
| **OpenClaw**          | **Dashboard Agent Chat** (SSE, vault, IDP cards)                                | **Shipped**               | [`docs/dashboard/agent-chat.md`](../dashboard/agent-chat.md), [`openclaw-idp-skill-profile.md`](../openclaw/openclaw-idp-skill-profile.md)                                                                                      |
| **OpenClaw**          | Slack-first **one-mention** IDP runbook                                         | **Gap**                   | [#256](https://github.com/danielsmithdevelopment/ClawQL/issues/256)                                                                                                                                                             |
| **Samples**           | Lending W-2 end-to-end pack (YAML/XML/prompts)                                  | **Gap**                   | [#253](https://github.com/danielsmithdevelopment/ClawQL/issues/253)                                                                                                                                                             |
| **Platform**          | Agent → PR → Argo CD self-service pipelines                                     | **Gap**                   | [#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258)                                                                                                                                                             |

---

## Already covered elsewhere (do not duplicate)

- **Merkle / audit attestations** in IDP chains: [#114](https://github.com/danielsmithdevelopment/ClawQL/issues/114), [#115](https://github.com/danielsmithdevelopment/ClawQL/issues/115), [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89) (audit tool).
- **Istio / ambient** lab: Docker Desktop observability doc + ADR 0003.
- **Sandbox** execution: [#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207), `CLAWQL_ENABLE_SANDBOX`.
- **Defense-in-depth redaction model** (Stirling document stage vs Presidio agent I/O): [`clawql-idp-stack.md`](../vision/clawql-idp-stack.md) §11.1 — not a duplicate row; matrix tracks implementation per layer above.

---

## Issue index (numeric)

| Range                                                   | Theme                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| #110, #114–#120, #125–#130, #178, #207, #210, #226–#228 | Core / security / OpenClaw / HITL MVP / observability foundations                                                         |
| #239, #241–#258, **#259**                               | Argo umbrella · Vault · privacy · LangExtract · HITL extensions · gap closure · IDP master wave · **epic checklist #259** |

---

## Maintenance

When the master reference changes, update this table, [`clawql-idp-stack.md`](../vision/clawql-idp-stack.md), and the **Primary tracking** links. Prefer **one** canonical issue per row; split only when blast radius or repo boundary demands it.
