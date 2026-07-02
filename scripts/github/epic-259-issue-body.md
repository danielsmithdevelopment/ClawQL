**Epic — consolidated checklist only.** Scope is **exactly** the linked issues below (no extra deliverables in this epic itself).

Canonical docs in this repo:
- [Gap closure plan (prioritized)](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/roadmap/gap-closure-plan-prioritized-2026.md)
- [IDP master requirements matrix](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/roadmap/idp-master-requirements-matrix.md)
- [Epic #259 checklist (living)](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/roadmap/epic-259-checklist.md)

**Last refreshed:** 2026-07-02

---

## Security & secrets

- [x] #241 — Vault default provider keys (PR #465)
- [x] #242 — Dashboard Provider secrets UI (PR #465)

## Workflows & GitOps

- [x] #243 — MCP `workflow` + Argo Workflows (6.4.0)
- [x] #244 — MCP `argocd` (PR #459)

## Document intelligence

- [ ] #245 — Local sparse-MoE privacy filter
- [ ] #246 — LangExtract extraction path
- [ ] #247 — HITL pre-annotations + vertical LS packs
- [ ] #248 — Docling + fine-tuned classifier (**partial**: bundled `docling` + runbook; BYO train/promote)

## HITL governance

- [ ] #249 — Multi-reviewer RBAC docs (Label Studio CE vs Enterprise)

## Evolution & eval

- [ ] #250 — Active learning (Langfuse eval → Ouroboros seeds)

## Deployment & verticals

- [ ] #251 — Four vertical Docker Compose stacks

## IDP master wave (observability, samples, integration, scale, platform)

- [ ] #252 — Observability bundle (Langfuse + Grafana/Prometheus + traces)
- [x] #253 — Lending W-2 sample pack (PR #460)
- [x] #254 — Argo suspend/resume + NATS HITL handoff (PR #458, #461)
- [ ] #255 — Optional `clawql-idp` umbrella Helm chart
- [ ] #256 — Slack-first OpenClaw IDP runbook
- [x] #257 — KEDA NATS worker (PR #463)
- [ ] #258 — Agent → Git PR → Argo CD promotion

---

## Remaining focus (gap plan P1 → P4)

**P1** #248 → **P2** #249 → **P3** #250 → **P4** #251

Quick wins alongside P1: **#256** (docs), **#252** (observability).
