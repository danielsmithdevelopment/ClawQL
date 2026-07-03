## clawql-mcp 6.4.1

**npm:** [clawql-mcp@6.4.1](https://www.npmjs.com/package/clawql-mcp)  
**Full changelog:** [CHANGELOG.md#641---2026-07-03](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#641---2026-07-03)

### Highlights

- **Distribution fix** ([#477](https://github.com/danielsmithdevelopment/ClawQL/pull/477)): **`npm install clawql-mcp`** and **`docker pull ghcr.io/danielsmithdevelopment/clawql-mcp`** work on a fresh machine without cloning the monorepo.
- **npm tarball** bundles all **`clawql-*`** workspace packages (`clawql-core`, `clawql-api`, `clawql-memory`, etc.) with compiled **`dist/`**.
- **Docker image** copies the full **`packages/`** tree so **`node_modules`** workspace symlinks resolve in the distroless runtime.

### Upgrade notes (6.4.0 → 6.4.1)

- **Required if 6.4.0 failed to start** — same MCP surface; no new env flags or tool renames.
- Prefer **`npm install clawql-mcp@6.4.1`** (or **`npx clawql-mcp-http`**) over **`@6.4.0`**.
- Re-pull the MCP container image after **`docker-publish`** promotes **`latest`** / **`nightly`**.

### Helm chart

- **`charts/clawql-mcp`:** **Chart.version `0.6.8`**, **`appVersion` `6.4.1`**.

### Install

```bash
npm install clawql-mcp@6.4.1
npx clawql-mcp-http

docker pull ghcr.io/danielsmithdevelopment/clawql-mcp:latest
```
