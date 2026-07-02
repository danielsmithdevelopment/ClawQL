# Gap closure plan and remaining roadmap (prioritized)

**Status:** living document — execution tracked in GitHub issues below. **Last updated:** 2026-06-30.

**Epic checklist (no extra scope):** [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259) lists **#241–#258** in one place.

This plan closes known **product gaps** called out for HITL, classification, active learning, and vertical onboarding. Priority is **P1 → P4** (highest first). Quarter hints are **targets**, not guarantees.

---

## Priority overview

| Priority | Gap                            | Closure direction                                                                                         | Target      | Tracking                                                                                                                                                                          |
| -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1**   | **Auto-classifier maturity**   | **Docling** as MCP/loadable provider + **fine-tuned classifier** model path and docs                      | **Q2 2026** | [#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248) — **Shipped** (Helm Docling, **`classify_document`**, reference classifier + compose); tenant train/promote BYO |
| **P2**   | **Multi-reviewer RBAC** (HITL) | Document **Label Studio CE** workarounds + optional **enterprise Label Studio** / BYO path                | Rolling     | [#249](https://github.com/danielsmithdevelopment/ClawQL/issues/249)                                                                                                               |
| **P3**   | **Active learning loop**       | **Langfuse** (or compatible) **eval hooks** → **Ouroboros** seed create/update with gates (~80% there)    | Rolling     | [#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)                                                                                                               |
| **P4**   | **One-click vertical stacks**  | Ship **four** opinionated **Docker Compose** files: **lending**, **healthcare**, **legal**, **education** | Rolling     | [#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)                                                                                                               |

---

## P1 — Auto-classifier maturity

**Gap:** Layout-aware parsing and tenant-specific classification are not first-class vs ad hoc `execute` on custom specs ([IDP profile](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/openclaw/openclaw-idp-skill-profile.md) lists Docling as “merge custom spec” today).

**Closure steps**

1. Land **Docling** OpenAPI (or gRPC) provider wiring + reference deploy snippet.
2. Publish **fine-tuned classifier** runbook: data → train → export → env pin; eval gates before promote.
3. Cross-link **LangExtract** structured extraction ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)) where extraction + classification meet.

**Exit criteria:** Docling on documented path; classifier promotion documented; security/release notes for images.

**Progress (6.4.0+):** bundled **`docling`**, Helm **`documentPipeline.docling`**, MCP **`classify_document`**, reference classifier HTTP + Compose — tenant-specific model training remains BYO.

---

## P2 — Multi-reviewer RBAC (HITL)

**Gap:** Teams need **multiple reviewer roles**; Label Studio **Community Edition** RBAC differs from enterprise.

**Closure steps**

1. Author **CE vs Enterprise** capability matrix in [`hitl-label-studio.md`](../mcp/hitl-label-studio.md).
2. Document **workaround patterns** (separate projects, import-only service account, webhook merge policy).
3. Optional Helm **pointers** to enterprise LS (BYO license) without redistributing paid bits.

**Exit criteria:** Operators can choose a pattern without reading source; links to upstream LS docs versioned.

**Related:** [#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228), [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247).

---

## P3 — Active learning loop

**Gap:** Feedback from production does not automatically tighten **Ouroboros** seeds; eval plumbing is partial.

**Closure steps**

1. Define **Langfuse** (or OSS-compatible) **webhook / export** → ClawQL normalization.
2. Map metrics to **seed revision** proposals (`ouroboros_*`); default **dry-run** or explicit auto flag.
3. Document overlap with **ClawQL-Agent** and [`clawql-ouroboros.md`](../ouroboros/clawql-ouroboros.md); align with [ADR 0001](../adr/0001-ouroboros-workflow-engine.md).

**Exit criteria:** Documented happy path; no silent seed overwrite; audit or vault trail for changes.

**Related:** [#110](https://github.com/danielsmithdevelopment/ClawQL/issues/110).

---

## P4 — One-click vertical stacks

**Gap:** Operators must assemble services manually; verticals (lending, healthcare, legal, education) want **copy-paste Compose**.

**Closure steps**

1. Add **`docker/compose/`** (or agreed tree) with **four** vertical files + env templates.
2. Extend [`docker/README.md`](../../docker/README.md): ports, conflicts with [`docker-compose.yml`](../../docker/docker-compose.yml), resource minimums.
3. Each vertical: **which providers**, **HITL defaults**, **disclaimer** (not legal/medical advice).

**Exit criteria:** `docker compose -f … config` clean; README smoke for each vertical.

---

## Related roadmap (already filed)

- **Vault default for API keys:** [#241](https://github.com/danielsmithdevelopment/ClawQL/issues/241) — **shipped** [vault-provider-secrets.md](../deployment/vault-provider-secrets.md) · **Vault UI:** [#242](https://github.com/danielsmithdevelopment/ClawQL/issues/242) — **shipped** (dashboard **Provider secrets**)
- **`workflow` + Argo Workflows:** [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243) · **Argo CD Phase B:** [#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)
- **Privacy filter (local MoE):** [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245) · **LangExtract:** [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)
- **HITL pre-annotations + vertical packs:** [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247)

### IDP master reference — wave 2 (full stack narrative)

Cross-cutting items from the **consolidated IDP super-edition** roadmap that are **not** covered by P1–P4 alone: [IDP master requirements matrix](idp-master-requirements-matrix.md).

| Track                                                              | Issue                                                                                                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observability bundle (Langfuse + Grafana/Prometheus + trace guide) | [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252)                                                                                                 |
| Lending W-2 **reference sample pack** (Argo + LS + OpenClaw)       | [#253](https://github.com/danielsmithdevelopment/ClawQL/issues/253) — **shipped** [`deployment/samples/lending-w2/`](../../deployment/samples/lending-w2/README.md) |
| **Argo suspend/resume** + HITL + optional **NATS**                 | [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254) — **shipped** (webhook + JetStream publish/consumer)                                            |
| Optional **`clawql-idp`** umbrella Helm chart                      | [#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)                                                                                                 |
| **Slack-first** OpenClaw IDP runbook                               | [#256](https://github.com/danielsmithdevelopment/ClawQL/issues/256)                                                                                                 |
| **KEDA** autoscaling (NATS queues)                                 | [#257](https://github.com/danielsmithdevelopment/ClawQL/issues/257) — **shipped** [`nats-keda-worker.md`](../deployment/nats-keda-worker.md)                        |
| Agent → **Git PR** → **Argo CD** promotion                         | [#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258)                                                                                                 |

---

## Maintenance

When an issue closes, update the **Priority overview** table (checkmark or “Done in release X”) and bump **Last updated**.
