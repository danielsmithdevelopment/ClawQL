# Roadmap draft: Argo Workflows + Argo CD as ClawQL providers

**Tracking issue:** [#239](https://github.com/danielsmithdevelopment/ClawQL/issues/239) — this file was used as the initial issue body; edit the issue or this doc and keep them loosely in sync. [ADR 0004](../adr/0004-argo-cd-workflows-clawql-pipelines.md) links the same issue.

## Summary

Add **optional** integration so agents use a dedicated MCP **`workflow`** tool (see [ADR 0004](../adr/0004-argo-cd-workflows-clawql-pipelines.md)) implemented **in `clawql-mcp`**, backed by **Argo Workflows** for durable DAG runs; optional later **Argo CD** exposure (Phase B). This supersedes the earlier sketch of relying only on **`search` / `execute`** against Argo CRD OpenAPI for Phase A.

## Motivation

- Today, long-running multi-step automation leans on **`schedule`**, **`notify`**, **document pipeline** stacks, and **`ouroboros_*`** — not on a first-class **user-defined DAG** runner in the cluster.
- Teams already standardize on **Argo Workflows** for ML/ETL/ops pipelines; exposing it through ClawQL avoids one-off kubectl scripts while keeping **audit** / **memory** / **execute** patterns consistent.

## Non-goals (initial)

- Installing Argo inside **`charts/clawql-mcp`** as a **required** dependency (may document optional subchart or external install only).
- Granting ClawQL **cluster-admin** by default.
- Replacing **Ouroboros** — different abstraction (evolutionary loop vs. DAG templates).

## Proposed phases

1. **Workflows (Phase A)** — MCP **`workflow`** tool; **`CLAWQL_ENABLE_WORKFLOW=1`** (proposed; see ADR); Argo **`Workflow`** / templates in **allowlisted namespaces**; reference RBAC Role.
2. **CD (Phase B)** — optional **`Application`** sync / status; separate flag; only after Phase A security model is proven.

## Acceptance criteria (Phase A sketch)

- [ ] Opt-in flag off → **`workflow`** not registered; no new attack surface.
- [ ] With flag on + valid SA: **`workflow`** can submit a minimal **`Workflow`** and read status in the allowlisted namespace.
- [ ] Docs: [`mcp-tools.md`](../mcp/mcp-tools.md), [`readme/configuration.md`](../readme/configuration.md), Helm README (if chart injects env).
- [ ] ADR 0004 moved to **Accepted** when merged.

## Open questions

- **Spec source**: hand-maintained OpenAPI subset vs. generated from CRDs?
- **Auth**: in-cluster SA only for v1, or support **`KUBECONFIG`** for dev?
- **Version skew**: minimum Argo Workflows / CD versions?

## References

- [GitHub #239 — tracking](https://github.com/danielsmithdevelopment/ClawQL/issues/239)
- [ADR 0004: Argo Workflows and Argo CD as optional providers](../adr/0004-argo-cd-workflows-clawql-pipelines.md)
- [ClawQL ecosystem — Appendix: Fiction and roadmap](../clawql-ecosystem.md#appendix-fiction-and-roadmap)
