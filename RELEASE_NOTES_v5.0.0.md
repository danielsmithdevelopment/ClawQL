## clawql-mcp 5.0.0

**npm:** [clawql-mcp@5.0.0](https://www.npmjs.com/package/clawql-mcp)  
**Full changelog:** [CHANGELOG.md#500---2026-04-27](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#500---2026-04-27)

### Highlights

- **Native GraphQL + gRPC** merged into **`search` / `execute`** ([ADR 0002](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0002-multi-protocol-supergraph.md)): `CLAWQL_GRAPHQL_SOURCES`, `CLAWQL_GRAPHQL_URL`, `CLAWQL_GRPC_SOURCES`, optional SDL/introspection-on-disk.
- **Core MCP tools:** **`audit`** and **`cache`** always registered — remove legacy enable flags ([CHANGELOG — Breaking](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)).
- **Ouroboros:** stricter convergence gates; ordered multi-route execute; evaluator provider evidence fixes ([#167](https://github.com/danielsmithdevelopment/ClawQL/issues/167)).
- **Cloudflare auth:** Global API Key support via **`X-Auth-Email` / `X-Auth-Key`** ([#168](https://github.com/danielsmithdevelopment/ClawQL/issues/168)).
- **Supply chain & Helm:** CI OSV + Trivy + SBOM; golden-image publish pipeline; chart **0.5.x** with **Kyverno** Cosign policy default **on** — see [golden-image-pipeline.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/golden-image-pipeline.md) and [image-signature-enforcement.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/image-signature-enforcement.md).

### Install

```bash
npm install clawql-mcp@5.0.0
```

**Node:** `>=22` (see `package.json` `engines`).

### Announcement drafts

Social / long-form copy: [docs/announcements/announcement-drafts-v5.0.0.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/announcements/announcement-drafts-v5.0.0.md)
