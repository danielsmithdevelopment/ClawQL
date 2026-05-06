## clawql-mcp 6.1.0

**npm:** [clawql-mcp@6.1.0](https://www.npmjs.com/package/clawql-mcp)  
**Full changelog:** [CHANGELOG.md#610---2026-05-06](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#610---2026-05-06)

### Highlights

- **Helm — Vault subchart + secret sourcing:** Chart ships **HashiCorp Vault** as a dependency (**`hashicorpvault`** alias); **`secretSourcing.requireVaultBackedSecrets`** enforces Vault-backed env unless overlays override; **External Secrets Operator** + Vault KV docs and example manifests.
- **Helm — bundled env dashboard:** Optional **`dashboard`** Deployment/Service/Ingress (local **`http://clawql.localhost`** on docker-desktop defaults), **Kyverno** image policy for **`clawql-dashboard`**, Vault/exec wiring via **`CLAWQL_DASHBOARD_*`**; docs site on **`http://docs.localhost`**; guides on [docs.clawql.com](https://docs.clawql.com) including **`/dashboard-kubernetes`**.
- **MCP edge — Panguard bridge:** Optional **`mcpProxy`** + **`clawql-panguard-mcp-bridge`** image; optional **JWT** gate (**`CLAWQL_MCP_JWT_ENABLED`**); unary **gRPC** delegation + E2E shim path. See **`docs/integrations/panguard-http-grpc-bridge.md`**.
- **Istio (local):** **LoadBalancer** ingress on desktop kube contexts, **VirtualService** fixes so **`/mcp`** reaches **`clawql-mcp-http`** (not the docs Next app); **`.cursor/mcp.json.example`** **`http://127.0.0.1/mcp`** for macOS **`::1`** quirks.
- **`istio.egressAllowlist`:** Optional **ServiceEntry** egress allowlisting for HTTPS.
- **Runtime containment:** **`security.kata`** + **Kyverno** **`runtimeClassPolicy`** for Kata vs gVisor; **`docs/security/runtime-class-containment.md`**.
- **Secret scanning:** **Gitleaks** in CI + pre-commit; **TruffleHog** on a schedule ( **`providers/`** excluded via **`.github/trufflehog-exclude-paths.txt`** ).
- **npm package (patch behavior):** Optional **`CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE`** for Streamable HTTP JSON mode; **default wire behavior unchanged** — safe **minor** upgrade from **6.0.0** for library consumers.

### Helm chart

- **`charts/clawql-mcp`:** **Chart.version `0.6.3`**, **`appVersion` `6.1.0`** (aligns with npm). Review **`values.yaml`** / **`values-docker-desktop.yaml`** when upgrading; platform changes are **deployment-oriented**, not another **Dragonfly**-style values migration.

### Install

```bash
npm install clawql-mcp@6.1.0
```

**Node:** `>=22` (see `package.json` `engines`).

### Announcement drafts

Social / long-form copy: [docs/announcements/announcement-drafts-v6.1.0.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/announcements/announcement-drafts-v6.1.0.md)
