# ADR 0004: Argo Workflows and Argo CD as optional providers (agent-driven pipelines)

- Status: **Proposed** (draft — not accepted; no implementation commitment yet)
- Date: 2026-05-02
- Intent: **post-6.0.0** capability — align after the semver-major release that ships current breaking Helm + MCP surface changes (see changelog **Unreleased** / **6.0.0** planning)
- Tracking: [#239](https://github.com/danielsmithdevelopment/ClawQL/issues/239)
- Related docs: [`docs/clawql-ecosystem.md`](../clawql-ecosystem.md) (Appendix), [`docs/roadmap/argo-workflows-cd-provider.md`](../roadmap/argo-workflows-cd-provider.md) (issue body source)

## Context

### Goal

Allow ClawQL (MCP **`search` / `execute`**, agents, OpenClaw) to **drive Kubernetes-native pipelines** from loaded specs: create runs, poll status, read logs/artifacts, and optionally **sync GitOps state** — without bespoke shell wrappers for every cluster.

Two CNCF-aligned systems are often named together but serve different roles:

| System             | Primary role                                                                                    | Natural fit for “ClawQL runs a pipeline”                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Argo Workflows** | DAG / step execution on Kubernetes (**`Workflow`**, **`WorkflowTemplate`**, **`CronWorkflow`**) | **High** — maps to parameterized jobs, retries, artifacts                                                                    |
| **Argo CD**        | Declarative continuous delivery (**`Application`**, sync, health, rollback)                     | **Medium** — fits “promote this revision”, “sync after tests”, multi-env GitOps; not a substitute for stepwise DAG execution |

### Constraints

- **Blast radius**: exposing cluster mutation through **`clawql-mcp`** is high risk if misconfigured (cluster-admin token, wide namespace access). Any design must default **off**, use **dedicated ServiceAccounts**, **namespace allowlists**, and document **impersonation / OIDC** patterns where clusters support them.
- **Spec surface**: Argo APIs are **Kubernetes CRD-first**; a stable **`operationId`** story may require **CRD-derived OpenAPI**, a maintained **wrapper spec**, or **native K8s-style execute** — same class of problem as other in-cluster providers.
- **Feature tier**: aligns with **default off — opt in** (same band as **`schedule`**, **`notify`**, **`ouroboros_*`**, gated **`sandbox_exec`** — see [`readme/configuration.md`](../readme/configuration.md) and feature tiers diagram).

### Relationship to 6.0.0

**6.0.0** should ship **existing** breaking and major UX changes (Helm value migrations, MCP tool registration defaults, observability path) **without** blocking on Argo. This ADR describes a **follow-on** slice (likely **6.1.0+** or a clearly labeled **preview** channel) unless the project explicitly widens the 6.0.0 scope.

## Decision (proposed)

### 1) Sequencing: **Argo Workflows before Argo CD**

- **Phase A — Workflows:** bundled (or loadable) spec + opt-in env (e.g. **`CLAWQL_ENABLE_ARGO_WORKFLOWS=1`**) to **`create` / `get` / `list` / `delete`** (as appropriate) **`Workflow`** and related types in an **allowlisted namespace set**; read-only **`WorkflowTemplate`** / **`ClusterWorkflowTemplate`** where RBAC permits.
- **Phase B — CD (optional):** separate flag (e.g. **`CLAWQL_ENABLE_ARGO_CD=1`**) for **`Application`** / sync operations **only if** product need is confirmed (agents driving GitOps vs. agents only needing DAG runs).

### 2) Security defaults

- **No** cluster-wide **`cluster-admin`** for ClawQL by default.
- **Require** explicit base URL or in-cluster endpoint + **kubeconfig-less** in-cluster SA **or** documented out-of-cluster kubeconfig path — pick one supported path first; avoid “magic full access.”
- **Document** minimum RBAC verbs per phase; provide **Helm** optional chart hooks or **reference Role** YAML (similar posture to Kyverno / scrape annotations docs).

### 3) Semver and API stability

- Treat **new tools** or **new bundled provider IDs** as **MINOR** once defaults remain safe.
- Treat **narrowing** allowlists, **renaming** env keys, or **removing** operations as **MAJOR** or **deprecated-then-remove** per [SemVer](https://semver.org/).

## Consequences

- **Docs + Helm**: chart may grow optional **Argo** subchart references or “bring your own Argo” links; not mandatory for minimal ClawQL installs.
- **Testing**: CI likely needs **kind** + **Argo** install for integration tests — heavier matrix; may stay optional job like Ouroboros Postgres.
- **OpenClaw / IDP**: [`openclaw/openclaw-idp-skill-profile.md`](../openclaw/openclaw-idp-skill-profile.md) may later list Argo-backed **`operationId`**s once stable — out of scope until Phase A is implemented.

## Status transitions

- Move to **Accepted** when: Phase A scope, env names, and RBAC model are agreed and at least one implementation PR is merged behind the opt-in flag.
- **Superseded** if the project chooses a different execution plane (e.g. Tekton only) — retain this ADR for history.
