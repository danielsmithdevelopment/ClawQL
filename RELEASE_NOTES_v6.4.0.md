## clawql-mcp 6.4.0

**npm:** [clawql-mcp@6.4.0](https://www.npmjs.com/package/clawql-mcp)  
**Full changelog:** [CHANGELOG.md#640---2026-07-01](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#640---2026-07-01)

### Highlights

- **Plugin Phase 2 (registration):** **`MemoryPlugin`**, **`DocumentsPlugin`**, **`AutomationPlugin`**, **`SandboxPlugin`**, and **`OuroborosPlugin`** register optional MCP tools via **`onRegister`** — horizontal logic stays in **`packages/*`**; **`tools.ts`** is thinner (core + HITL only).
- **Argo `workflow` tool** ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243)): **`CLAWQL_ENABLE_WORKFLOW=1`** — submit, wait, get, list, logs, suspend/resume, cron, artifacts against Argo Workflows ≥ 3.4.0; Helm **`enableWorkflow`** + RBAC; vault daily digest template; optional Slack notify on terminal **`wait`**; HITL webhook auto-resume.
- **Argo CD `argocd` tool** ([#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)): **`CLAWQL_ENABLE_ARGO_CD=1`** — Application observe/sync via Kubernetes CRD API; Helm **`argocd`** RBAC.
- **Sandbox Kata (in-cluster):** **`CLAWQL_ENABLE_SANDBOX=1`** with unset backend in Kubernetes defaults to **`auto`** (**Kata** → Docker → bridge → Seatbelt); Helm **`sandboxKata`**.
- **IDP expansion:** default **`all-providers`** merge adds **nextcloud** + **coneshare** when documents are enabled; optional ConeShare webhook (**`CLAWQL_ENABLE_CONESHARE=1`**).
- **Docling + lending W-2 samples:** bundled **`docling`** provider ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)); W-2 reference pack ([#253](https://github.com/danielsmithdevelopment/ClawQL/issues/253)) under **`deployment/samples/lending-w2/`**; classifier runbook at **`docs/runbooks/fine-tuned-classifier.md`**.
- **IDP epic wave (#252–#258):** umbrella Helm chart **`charts/clawql-idp`** + **`values-idp-full.yaml`**; observability bundle (**`docs/observability/`**, Grafana **`clawql-idp-observability.json`**); Slack-first IDP runbook; agent PR → Argo CD GitOps doc.
- **LangExtract + pipeline runner:** MCP **`extract_document`** (`CLAWQL_ENABLE_LANGEXTRACT=1`), **`run_idp_pipeline`** (`CLAWQL_ENABLE_IDP_PIPELINE=1`); reference sidecar **`deployment/samples/langextract-http/`** (demo mode by default; live pip deps in Dockerfile comments — no committed `requirements.txt` for OSV).
- **Vault provider secrets (#241):** default **`envFromSecret: clawql-provider-env`**, dashboard Provider secrets UI (#242), KEDA NATS worker (#257).

### Upgrade notes (6.3.x → 6.4.0)

- **Not a semver-major break** — same MCP tool names and **`CLAWQL_ENABLE_*`** gates for existing features.
- **Larger default merge:** with documents on (default), cold **`loadSpec()`** may load **three more bundled vendors** (**nextcloud**, **coneshare**, **docling**) vs 6.3.x. Set **`CLAWQL_ENABLE_DOCUMENTS=0`** or narrow **`CLAWQL_BUNDLED_PROVIDERS`** if you want a smaller index.
- **Sandbox in Kubernetes:** unset **`CLAWQL_SANDBOX_BACKEND`** now defaults to **`auto`** (Kata-first) in-cluster, not bridge-only. Pin **`bridge`** or **`docker`** to preserve prior behavior.
- **New opt-in flags:** **`CLAWQL_ENABLE_WORKFLOW`**, **`CLAWQL_ENABLE_ARGO_CD`**, **`CLAWQL_ENABLE_CONESHARE`** (+ Helm **`enableWorkflow`**, **`argocd`**, **`idpCollaboration`**, **`sandboxKata`**).
- **Effect Layers:** still **partial** — only **`search`** / **`execute`** use Effect Layers today; horizontal packages remain **`async`** behind plugins. Full **`Layer.mergeAll`** is a follow-on milestone, not required for this minor.
- If you **deep-imported** removed **`src/ouroboros-mcp.ts`** or **`src/ouroboros/*`** (unsupported), use **`clawql-ouroboros`** package paths or MCP **`ouroboros_*`** tools.

### Helm chart

- **`charts/clawql-mcp`:** **Chart.version `0.6.7`**, **`appVersion` `6.4.0`** (aligns with npm). Review new values: **`enableWorkflow`**, **`workflow.*`**, **`argocd`**, **`sandboxKata`**, **`idpCollaboration`**, **`documentPipeline.docling`**.
- **`charts/clawql-idp`:** umbrella chart for full IDP profile — see **`docs/deployment/clawql-idp-helm.md`** and **`values-idp-full.yaml`**.

### Install

```bash
npm install clawql-mcp@6.4.0
```

**Node:** `>=22` (see `package.json` `engines`).
