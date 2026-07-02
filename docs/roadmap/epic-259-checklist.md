# Epic #259 — local IDP + OpenClaw platform (checklist)

**GitHub epic:** [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259)  
**Last updated:** 2026-07-02 (post-merge #241/#242/#257)

Canonical planning docs: [gap closure plan](gap-closure-plan-prioritized-2026.md) · [IDP master matrix](idp-master-requirements-matrix.md)

---

## Shipped (close on GitHub if still open)

| Issue                                                               | Title                           | Shipped in                                                                                                                                               |
| ------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#241](https://github.com/danielsmithdevelopment/ClawQL/issues/241) | Vault default provider keys     | PR [#465](https://github.com/danielsmithdevelopment/ClawQL/pull/465)                                                                                     |
| [#242](https://github.com/danielsmithdevelopment/ClawQL/issues/242) | Dashboard Provider secrets UI   | PR [#465](https://github.com/danielsmithdevelopment/ClawQL/pull/465)                                                                                     |
| [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243) | MCP `workflow` + Argo Workflows | 6.4.0 ([#451](https://github.com/danielsmithdevelopment/ClawQL/pull/451)–[#459](https://github.com/danielsmithdevelopment/ClawQL/pull/459))              |
| [#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244) | MCP `argocd`                    | PR [#459](https://github.com/danielsmithdevelopment/ClawQL/pull/459)                                                                                     |
| [#253](https://github.com/danielsmithdevelopment/ClawQL/issues/253) | Lending W-2 sample pack         | PR [#460](https://github.com/danielsmithdevelopment/ClawQL/pull/460) · [`deployment/samples/lending-w2/`](../../deployment/samples/lending-w2/README.md) |
| [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254) | HITL suspend/resume + NATS      | PR [#458](https://github.com/danielsmithdevelopment/ClawQL/pull/458), [#461](https://github.com/danielsmithdevelopment/ClawQL/pull/461)                  |
| [#257](https://github.com/danielsmithdevelopment/ClawQL/issues/257) | KEDA NATS worker                | PR [#463](https://github.com/danielsmithdevelopment/ClawQL/pull/463)                                                                                     |

**Housekeeping:** run `bash scripts/github/close-shipped-epic-259-issues.sh` (needs `gh` with issue write access).

---

## Open — priority order

### Gap closure plan (official P1 → P4)

| Priority | Issue                                                               | Summary                                                                      |
| -------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **P1**   | [#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248) | Docling + fine-tuned classifier (Docling bundled; BYO train/promote remains) |
| **P2**   | [#249](https://github.com/danielsmithdevelopment/ClawQL/issues/249) | HITL multi-reviewer RBAC docs (Label Studio CE vs Enterprise)                |
| **P3**   | [#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250) | Active learning — Langfuse eval → Ouroboros seeds                            |
| **P4**   | [#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251) | Vertical Docker Compose stacks (lending, healthcare, legal, education)       |

### IDP wave (remaining)

| Issue                                                               | Summary                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245) | Local sparse-MoE privacy filter                               |
| [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246) | LangExtract extraction path                                   |
| [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247) | HITL pre-annotations + vertical LS packs                      |
| [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252) | Observability bundle (Langfuse + Grafana/Prometheus + traces) |
| [#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255) | Optional `clawql-idp` umbrella Helm chart                     |
| [#256](https://github.com/danielsmithdevelopment/ClawQL/issues/256) | Slack-first OpenClaw IDP runbook                              |
| [#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258) | Agent → Git PR → Argo CD promotion                            |

---

## Suggested next implementation

1. **#248 (P1)** — classifier maturity (product depth)
2. **#251 (P4)** or **#256** — operator onboarding / narrative (fast wins)
3. **#252** — production observability
