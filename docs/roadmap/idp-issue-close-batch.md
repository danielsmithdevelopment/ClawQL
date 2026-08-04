# IDP shipped-issue close batch (2026-08-04)

**Purpose:** Close tracking issues that the [IDP master requirements matrix](idp-master-requirements-matrix.md) already marks **Shipped**, and refresh epic [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259).

The Cloud Agent `gh` token cannot mutate issues (`403 Resource not accessible by integration`). CI closes them on merge of this file to `main` via [`.github/workflows/idp-close-shipped-issues.yml`](../../.github/workflows/idp-close-shipped-issues.yml).

## Issues to close (completed)

| Issue | Evidence                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------- |
| #227  | [`openclaw-idp-skill-profile.md`](../openclaw/openclaw-idp-skill-profile.md)                                         |
| #226  | OpenClaw MCP bootstrap docs ([`clawql-bootstrap.md`](../openclaw/clawql-bootstrap.md)) — matrix OpenClaw install row |
| #242  | Dashboard Provider secrets (Vault UI)                                                                                |
| #244  | MCP `argocd` (`CLAWQL_ENABLE_ARGO_CD=1`)                                                                             |
| #246  | `extract_document` + langextract-http + Helm                                                                         |
| #248  | Docling + `classify_document` + classifier sample (tenant train BYO remains follow-up)                               |
| #249  | [`hitl-label-studio.md` §14](../mcp/hitl-label-studio.md#14-multi-reviewer-rbac-ce-vs-enterprise)                    |
| #252  | [`docs/observability/README.md`](../observability/README.md)                                                         |
| #253  | [`deployment/samples/lending-w2/`](../../deployment/samples/lending-w2/)                                             |
| #254  | Argo suspend/resume + HITL webhook + NATS JetStream                                                                  |
| #255  | [`charts/clawql-idp`](../../charts/clawql-idp)                                                                       |
| #256  | [`slack-first-idp-runbook.md`](../openclaw/slack-first-idp-runbook.md)                                               |
| #257  | [`nats-keda-worker.md`](../deployment/nats-keda-worker.md)                                                           |
| #258  | [`agent-pr-argocd-pipeline.md`](../gitops/agent-pr-argocd-pipeline.md) (in-repo contract; ClawQL-Agent via #128)     |
| #259  | Epic checklist — all #241–#258 children shipped                                                                      |

## Leave open

| Issue | Why                                                       |
| ----- | --------------------------------------------------------- |
| #128  | Ecosystem umbrella (ClawQL-Agent / OpenClaw coordination) |

## Machine-readable list

```
227
226
242
244
246
248
249
252
253
254
255
256
257
258
259
```
