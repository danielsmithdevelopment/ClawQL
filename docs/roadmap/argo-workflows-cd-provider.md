# Roadmap draft: Argo Workflows + Argo CD as ClawQL providers

**Tracking issue:** [#239](https://github.com/danielsmithdevelopment/ClawQL/issues/239) — this file was used as the initial issue body; edit the issue or this doc and keep them loosely in sync. [ADR 0004](../adr/0004-argo-cd-workflows-clawql-pipelines.md) links the same issue. **Design:** [`docs/design/workflow-tool-argo.md`](../design/workflow-tool-argo.md).

## Summary

Add **optional** integration so agents use a dedicated MCP **`workflow`** tool (see [ADR 0004](../adr/0004-argo-cd-workflows-clawql-pipelines.md)) implemented in **`clawql-automation`** (**`AutomationPlugin`**), backed by **Argo Workflows** for durable DAG runs; optional later **Argo CD** exposure (Phase B). This supersedes the earlier sketch of relying only on **`search` / `execute`** against Argo CRD OpenAPI for Phase A.

## Motivation

- Today, long-running multi-step automation leans on **`schedule`**, **`notify`**, **document pipeline** stacks, and **`ouroboros_*`** — not on a first-class **user-defined DAG** runner in the cluster.
- Teams already standardize on **Argo Workflows** for ML/ETL/ops pipelines; exposing it through ClawQL avoids one-off kubectl scripts while keeping **audit** / **memory** / **execute** patterns consistent.

## Non-goals (initial)

- Installing Argo inside **`charts/clawql-mcp`** as a **required** dependency (may document optional subchart or external install only).
- Granting ClawQL **cluster-admin** by default.
- Replacing **Ouroboros** — different abstraction (evolutionary loop vs. DAG templates).
- **Inline `Workflow` specs** in v1 — submits are **template-ref only** (see design doc).

## Proposed phases

1. **Workflows (Phase A)** — MCP **`workflow`** tool; **`CLAWQL_ENABLE_WORKFLOW=1`**; template-ref **`submit`**; **`get` / `list` / `list_templates` / `logs`**; Argo **`Workflow`** in **allowlisted namespaces**; **`@kubernetes/client-node`**; reference RBAC Role; **Argo Workflows ≥ 3.4.0**.
2. **Workflows (Phase A.2)** — **`wait`** (poll until terminal), optional **`delete`**, Helm SA wiring.
3. **CD (Phase B)** — optional **`Application`** sync / status; separate flag; only after Phase A security model is proven.

## Acceptance criteria (Phase A sketch)

- [ ] Opt-in flag off → **`workflow`** not registered; no new attack surface.
- [ ] With flag on + valid SA: **`workflow`** can **`submit`** from a **`WorkflowTemplate`** and **`get`** status in the allowlisted namespace.
- [ ] Docs: [`workflow-tool-argo.md`](../design/workflow-tool-argo.md), [`mcp-tools.md`](../mcp/mcp-tools.md), [`readme/configuration.md`](../readme/configuration.md), Helm README (if chart injects env).
- [ ] ADR 0004 moved to **Accepted** when implementation PR merges.

## Resolved design questions (June 2026)

| Question         | Resolution                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| **Spec source**  | Dedicated **`workflow`** MCP tool with curated ops — not CRD OpenAPI via **`execute`** for Phase A. |
| **Auth**         | In-cluster SA (production) **and** **`CLAWQL_WORKFLOW_KUBECONFIG`** (dev).                          |
| **Submit shape** | **Template-only** v1 — `WorkflowTemplate` / `ClusterWorkflowTemplate` + parameters.                 |
| **K8s client**   | **`@kubernetes/client-node`**.                                                                      |
| **Polling**      | **`get`** in Phase A; **`wait`** in Phase A.2.                                                      |
| **Correlation**  | Label **`clawql.dev/correlation-id`** + **`clawql.dev/managed`**.                                   |
| **Version skew** | Minimum **Argo Workflows ≥ 3.4.0**. Argo CD minimum TBD at Phase B.                                 |

## References

- [Design: workflow tool (Argo)](../design/workflow-tool-argo.md)
- [GitHub #239 — tracking](https://github.com/danielsmithdevelopment/ClawQL/issues/239)
- [GitHub #243 — implementation](https://github.com/danielsmithdevelopment/ClawQL/issues/243)
- [ADR 0004: Argo Workflows and Argo CD as optional providers](../adr/0004-argo-cd-workflows-clawql-pipelines.md)
- [ClawQL ecosystem — Appendix: Fiction and roadmap](../clawql-ecosystem.md#appendix-fiction-and-roadmap)
