## clawql-mcp 6.2.1

**npm:** [clawql-mcp@6.2.1](https://www.npmjs.com/package/clawql-mcp) (after publish)  
**Full changelog:** [CHANGELOG.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)

### Highlights

- **`fetch-provider-specs`:** Paperless OpenAPI validation, **Paperless-ngx ≥ 2.15** guidance, in-cluster HTTP diagnostics, **Gotenberg** pinned **`docs/openapi.yaml`** when the server has no **`/openapi.json`** (**`GOTENBERG_OPENAPI_PIN_URL`** override).
- **Helm:** default **Paperless** image **2.15.0**; remove ineffective **`PAPERLESS_API_TOKEN`** env on the Paperless workload.
- **Bundled specs:** full **Tika** JAX-RS OpenAPI, full **Gotenberg** (v7.10 upstream pin), refreshed **paperless** / **stirling** / **onyx** / **sentry** / **GitHub** / **Cloudflare** / **Google discovery** where applicable.
- **`execute`:** multipart parts support **`fileEncoding: base64`** with **`fileFileName`**.
- **Local k8s:** apply Istio provider **`*.localhost`** VirtualServices when **Stirling** exists (not only on full stack).

### Helm chart

- **`charts/clawql-mcp`:** **Chart.version `0.6.5`**, **`appVersion` `6.2.1`** (aligns with npm).

### Install

```bash
npm install clawql-mcp@6.2.1
```

**Node:** `>=22` (see `package.json` `engines`).
