# ADR 0004: Optional **`workflow`** MCP tool (Argo Workflows) and optional Argo CD

- Status: **Proposed** (draft — not accepted; no implementation commitment yet)
- Date: 2026-05-02
- Intent: **post-6.0.0** capability — align after the semver-major release that ships current breaking Helm + MCP surface changes (see changelog **Unreleased** / **6.0.0** planning)
- Tracking: [#239](https://github.com/danielsmithdevelopment/ClawQL/issues/239)
- Related docs: [`docs/clawql-ecosystem.md`](../clawql-ecosystem.md) (Appendix), [`docs/roadmap/argo-workflows-cd-provider.md`](../roadmap/argo-workflows-cd-provider.md) (issue body source)

## Context

### Goal

Ship an opt-in MCP **`workflow`** tool **inside `clawql-mcp`** (same product band as **`schedule`** and **`notify`**: default off, explicit env to register). The tool is the **stable agent surface** for **durable, spec-driven pipelines that are the same every time**; the **execution plane** is **Argo Workflows** on Kubernetes (**`Workflow`**, **`WorkflowTemplate`**, **`CronWorkflow`**, status, logs, artifacts as RBAC allows) — not a separate “workflow microservice” for the first slice.

Agents and operators use **`workflow`** to submit and observe runs; they keep using **`search` / `execute`** for ad hoc API calls. Optional follow-on: drive **Argo CD** (`Application`, sync, health) behind a separate flag if GitOps promotion flows are confirmed.

### Secondary goal

Allow ClawQL (MCP **`search` / `execute`**, agents, OpenClaw) to **drive Kubernetes-native pipelines** without bespoke shell wrappers for every cluster: create runs, poll status, read logs/artifacts, and optionally **sync GitOps state**.

Two CNCF-aligned systems are often named together but serve different roles:

| System             | Primary role                                                                                    | Natural fit for “ClawQL runs a pipeline”                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Argo Workflows** | DAG / step execution on Kubernetes (**`Workflow`**, **`WorkflowTemplate`**, **`CronWorkflow`**) | **High** — maps to parameterized jobs, retries, artifacts                                                                    |
| **Argo CD**        | Declarative continuous delivery (**`Application`**, sync, health, rollback)                     | **Medium** — fits “promote this revision”, “sync after tests”, multi-env GitOps; not a substitute for stepwise DAG execution |

### Constraints

- **Blast radius**: exposing cluster mutation through **`clawql-mcp`** is high risk if misconfigured (cluster-admin token, wide namespace access). Any design must default **off**, use **dedicated ServiceAccounts**, **namespace allowlists**, and document **impersonation / OIDC** patterns where clusters support them.
- **Spec surface**: Argo APIs are **Kubernetes CRD-first**; a stable **`operationId`** story may require **CRD-derived OpenAPI**, a maintained **wrapper spec**, or **native K8s-style execute** — same class of problem as other in-cluster providers.
- **Feature tier**: **`workflow`** aligns with **default off — opt in** (same band as **`schedule`**, **`notify`**, **`ouroboros_*`**, gated **`sandbox_exec`** — see [`readme/configuration.md`](../readme/configuration.md) and feature tiers diagram). Proposed registration gate: **`CLAWQL_ENABLE_WORKFLOW=1`** (exact name subject to review; must mirror the **`CLAWQL_ENABLE_*`** truthy pattern used in [`src/clawql-optional-flags.ts`](../../src/clawql-optional-flags.ts)).

### Relationship to 6.0.0

**6.0.0** should ship **existing** breaking and major UX changes (Helm value migrations, MCP tool registration defaults, observability path) **without** blocking on Argo. This ADR describes a **follow-on** slice (likely **6.1.0+** or a clearly labeled **preview** channel) unless the project explicitly widens the 6.0.0 scope.

## Decision (proposed)

### 1) MCP surface: **`workflow`** tool in **`clawql-mcp`**, Argo Workflows as backend

- **Phase A — Workflows:** When **`CLAWQL_ENABLE_WORKFLOW=1`** (proposed), register the optional **`workflow`** MCP tool. Implement it **in-process** in **`clawql-mcp`** (HTTP and stdio transports), calling the Kubernetes / Argo Workflows API (client libraries or K8s API server with Argo CRDs) to **`create` / `get` / `list` / `delete`** (as appropriate) **`Workflow`** resources and to read **`WorkflowTemplate`** / **`ClusterWorkflowTemplate`** where RBAC permits. Tool input/output shapes are **workflow-oriented** (run id, namespace, template ref, parameters, phase, links to logs); they **do not** expose raw `kubectl` or unbounded cluster scope.
- **Connection and RBAC** are configured via explicit env (base URL, kubeconfig path, or in-cluster SA) documented alongside the flag — same security posture as §3 below.
- **Phase B — CD (optional):** separate flag (e.g. **`CLAWQL_ENABLE_ARGO_CD=1`**) for **`Application`** / sync operations **only if** product need is confirmed (agents driving GitOps vs. agents only needing DAG runs). May remain **`execute`** on a loaded Argo CD OpenAPI spec instead of a second dedicated tool; decide when Phase B is scoped.

### 2) Sequencing: **Argo Workflows (`workflow` tool) before Argo CD**

- Phase A delivers **`workflow`** + Argo Workflows; Phase B is CD only if needed.

### 3) Security defaults

- **No** cluster-wide **`cluster-admin`** for ClawQL by default.
- **Require** explicit base URL or in-cluster endpoint + **kubeconfig-less** in-cluster SA **or** documented out-of-cluster kubeconfig path — pick one supported path first; avoid “magic full access.”
- **Document** minimum RBAC verbs per phase; provide **Helm** optional chart hooks or **reference Role** YAML (similar posture to Kyverno / scrape annotations docs).

### 4) Semver and API stability

- Treat **new tools** or **new bundled provider IDs** as **MINOR** once defaults remain safe.
- Treat **narrowing** allowlists, **renaming** env keys, or **removing** operations as **MAJOR** or **deprecated-then-remove** per [SemVer](https://semver.org/).

## Consequences

- **Docs + Helm**: chart may grow optional **Argo Workflows** subchart references or “bring your own Argo” links; not mandatory for minimal ClawQL installs. **`clawql-mcp`** needs a path to the K8s API (or documented out-of-cluster kubeconfig) when **`workflow`** is enabled.
- **Testing**: CI likely needs **kind** + **Argo** install for integration tests — heavier matrix; may stay optional job like Ouroboros Postgres.
- **OpenClaw / IDP**: [`openclaw/openclaw-idp-skill-profile.md`](../openclaw/openclaw-idp-skill-profile.md) may later document **`workflow`** recipes alongside **`search` / `execute`** once stable.
- **NATS / event-driven choreography** (see [`deployment/helm.md`](../deployment/helm.md) subject roots): optional future work — Argo **`Workflow`** status changes can be **wired to** JetStream by separate controllers or agents; not required for the first **`workflow`** tool slice.

## Status transitions

- Move to **Accepted** when: **`workflow`** tool scope, **`CLAWQL_ENABLE_WORKFLOW`** (or chosen) env name, Argo client wiring, and RBAC model are agreed and at least one implementation PR is merged behind the opt-in flag.
- **Superseded** if the project chooses a different execution plane (e.g. Tekton only) — retain this ADR for history.
