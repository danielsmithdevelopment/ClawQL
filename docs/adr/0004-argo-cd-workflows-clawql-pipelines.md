# ADR 0004: Optional **`workflow`** MCP tool (Argo Workflows) and optional Argo CD

- Status: **Accepted** (Phase A implemented June 2026 — `CLAWQL_ENABLE_WORKFLOW=1`, [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243))
- Date: 2026-05-02 (updated 2026-06-30)
- Intent: **post-6.0.0** capability — align after the semver-major release that ships current breaking Helm + MCP surface changes (see changelog **Unreleased** / **6.0.0** planning)
- Tracking: [#239](https://github.com/danielsmithdevelopment/ClawQL/issues/239), implementation [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243)
- Related docs: [`docs/design/workflow-tool-argo.md`](../design/workflow-tool-argo.md), [`docs/clawql-ecosystem.md`](../clawql-ecosystem.md) (Appendix), [`docs/roadmap/argo-workflows-cd-provider.md`](../roadmap/argo-workflows-cd-provider.md) (issue body source)

## Context

### Goal

Ship an opt-in MCP **`workflow`** tool in **`clawql-automation`** (**`AutomationPlugin`** — same product band as **`schedule`** and **`notify`**: default off, explicit env to register). The tool is the **stable agent surface** for **durable, spec-driven pipelines that are the same every time**; the **execution plane** is **Argo Workflows** on Kubernetes (**`Workflow`**, **`WorkflowTemplate`**, **`CronWorkflow`**, status, logs, artifacts as RBAC allows) — not a separate “workflow microservice” for the first slice.

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
- **Spec surface**: Argo APIs are **Kubernetes CRD-first**. Phase A uses a **dedicated `workflow` MCP tool** with curated operations — **not** raw CRD OpenAPI via **`execute`** — so agents get workflow-oriented shapes (phase, template ref, node summary) without unbounded cluster scope.
- **Feature tier**: **`workflow`** aligns with **default off — opt in** (same band as **`schedule`**, **`notify`**, **`ouroboros_*`**, gated **`sandbox_exec`** — see [`readme/configuration.md`](../readme/configuration.md) and feature tiers diagram). Registration gate: **`CLAWQL_ENABLE_WORKFLOW=1`** (mirrors the **`CLAWQL_ENABLE_*`** truthy pattern in [`packages/clawql-api/src/config/optional-flags.ts`](../../packages/clawql-api/src/config/optional-flags.ts)).

### Relationship to 6.0.0

**6.0.0** should ship **existing** breaking and major UX changes (Helm value migrations, MCP tool registration defaults, observability path) **without** blocking on Argo. This ADR describes a **follow-on** slice (likely **6.1.0+** or a clearly labeled **preview** channel) unless the project explicitly widens the 6.0.0 scope.

## Decision (proposed)

### 1) MCP surface: **`workflow`** tool in **`clawql-automation`**, Argo Workflows as backend

- **Phase A — Workflows:** When **`CLAWQL_ENABLE_WORKFLOW=1`**, register the optional **`workflow`** MCP tool via **`AutomationPlugin.onRegister`**. Implement handler logic in **`packages/clawql-automation`** (composed by **`buildMcpPlugins()`** in `src/clawql-api-adapters.ts`); HTTP and stdio transports inherit registration automatically.
- **Kubernetes client:** **`@kubernetes/client-node`** — `CustomObjectsApi` for Argo CRDs, `CoreV1Api` for pod logs.
- **Submit model (v1):** **Template-only** — `submit` creates a `Workflow` from an allowlisted **`WorkflowTemplate`** or **`ClusterWorkflowTemplate`** reference plus parameters. **No** arbitrary inline `Workflow` specs in v1.
- **Operations (Phase A):** `submit`, `get`, `list`, `list_templates`, `logs`, `wait` (poll until terminal phase or timeout). Phase A.2 adds optional `delete` (env-gated).
- **Tool I/O:** Workflow-oriented JSON (namespace, name, template ref, parameters, phase, condensed nodes, `links.argo_ui`) — not raw `kubectl` or full CRD dumps.
- **Correlation:** Submitted workflows carry label **`clawql.dev/correlation-id`** (caller `correlation_id`) and **`clawql.dev/managed: "true"`** for list/filter and audit pairing.
- **Connection and RBAC** via explicit env (in-cluster ServiceAccount or **`CLAWQL_WORKFLOW_KUBECONFIG`** for dev) documented alongside the flag — same security posture as §3 below.
- **Minimum Argo Workflows version:** **≥ 3.4.0** (integration tests and docs target this floor).
- **Phase B — CD (optional):** separate flag (e.g. **`CLAWQL_ENABLE_ARGO_CD=1`**) for **`Application`** / sync operations **only if** product need is confirmed (agents driving GitOps vs. agents only needing DAG runs). May remain **`execute`** on a loaded Argo CD OpenAPI spec instead of a second dedicated tool; decide when Phase B is scoped.

### 2) Sequencing: **Argo Workflows (`workflow` tool) before Argo CD**

- Phase A delivers **`workflow`** + Argo Workflows; Phase B is CD only if needed.

### 3) Security defaults

- **No** cluster-wide **`cluster-admin`** for ClawQL by default.
- **Require** namespace **allowlist** (`CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST`) when the tool is enabled.
- Support **in-cluster SA** (preferred for production) **and** documented out-of-cluster **`CLAWQL_WORKFLOW_KUBECONFIG`** for development.
- **Document** minimum RBAC verbs per phase; provide **Helm** optional chart hooks or **reference Role** YAML (similar posture to Kyverno / scrape annotations docs). See [`docs/design/workflow-tool-argo.md`](../design/workflow-tool-argo.md).

### 4) Semver and API stability

- Treat **new tools** or **new bundled provider IDs** as **MINOR** once defaults remain safe.
- Treat **narrowing** allowlists, **renaming** env keys, or **removing** operations as **MAJOR** or **deprecated-then-remove** per [SemVer](https://semver.org/).

## Consequences

- **Docs + Helm**: chart may grow optional **Argo Workflows** subchart references or “bring your own Argo” links; not mandatory for minimal ClawQL installs. When **`workflow`** is enabled, **`clawql-mcp`** (or the automation plugin runtime) needs a path to the K8s API via in-cluster config or **`CLAWQL_WORKFLOW_KUBECONFIG`**.
- **Dependency**: **`@kubernetes/client-node`** added to **`clawql-automation`** (not the default install path when the flag is off).
- **Testing**: CI likely needs **kind** + **Argo Workflows ≥ 3.4.0** for integration tests — heavier matrix; may stay optional job like Ouroboros Postgres.
- **OpenClaw / IDP**: [`openclaw/openclaw-idp-skill-profile.md`](../openclaw/openclaw-idp-skill-profile.md) may later document **`workflow`** recipes alongside **`search` / `execute`** once stable.
- **NATS / event-driven choreography** (see [`deployment/helm.md`](../deployment/helm.md) subject roots): optional future work — Argo **`Workflow`** status changes can be **wired to** JetStream by separate controllers or agents; not required for the first **`workflow`** tool slice.

## Status transitions

- Move to **Accepted** when: **`workflow`** tool scope (per [`docs/design/workflow-tool-argo.md`](../design/workflow-tool-argo.md)), **`CLAWQL_ENABLE_WORKFLOW`**, **`@kubernetes/client-node`** wiring, template-only v1, and RBAC model are implemented and at least one implementation PR is merged behind the opt-in flag.
- **Superseded** if the project chooses a different execution plane (e.g. Tekton only) — retain this ADR for history.
