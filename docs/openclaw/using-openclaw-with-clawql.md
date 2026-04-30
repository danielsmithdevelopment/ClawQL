# Using OpenClaw with ClawQL

This guide describes **end-to-end** how to run **OpenClaw** (the **CLI / gateway** shipped as npm **`openclaw`**) alongside **ClawQL MCP** (`clawql-mcp`), register ClawQL as an MCP server OpenClaw can call, validate the setup, and move on to document-IDP-style workflows.

**Shorter runbooks (still maintained):**

- **[`clawql-bootstrap.md`](clawql-bootstrap.md)** — Phase 0 smoke tests and checklist ([#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)).
- **[`openclaw-idp-skill-profile.md`](openclaw-idp-skill-profile.md)** — OpenClaw + document pipeline contract ([#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227)).

**Umbrella tracking:** [#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128).

---

## 1. Concepts

| Term                     | What it is                                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ClawQL**               | **MCP server** in this repo: **`search`**, **`execute`**, **`audit`**, **`cache`**, vault **`memory_*`**, Documents, optional tools — exposed over **stdio** or **Streamable HTTP** (`…/mcp`).             |
| **OpenClaw**             | **Separate product** — npm package **`openclaw`** ([registry](https://www.npmjs.com/package/openclaw)): multi-channel AI gateway, **`openclaw mcp`** commands, agents, TUI, etc. Not built from this repo. |
| **`clawql-mcp`** (npm)   | The **ClawQL** package/binary (`clawql-mcp` stdio, `clawql-mcp-http` HTTP).                                                                                                                                |
| **`openclaw-mcp`** (npm) | **Different package** — MCP server that bridges **other hosts** (e.g. Claude Desktop) **to** an OpenClaw **gateway**. Use **`clawql-mcp`** when you want APIs via ClawQL; do not confuse the two names.    |

OpenClaw **consumes** MCP servers you configure (including ClawQL). You do **not** need the **`openclaw-mcp`** npm package to register **ClawQL** in OpenClaw.

---

## 2. Prerequisites

- **Node.js** **20+** (repo targets **22+** for development).
- **ClawQL** either from **`npm install clawql-mcp`** / **`npx -y clawql-mcp`**, or built from a git clone (**`npm run build`**).
- **OpenClaw CLI**: **`npm install -g openclaw`**, then **`openclaw --version`**.
- Optional: **`gh auth login`** or **`CLAWQL_BEARER_TOKEN`** if you want live **GitHub** **`execute`** smokes against private repositories.

---

## 3. Install OpenClaw

```bash
npm install -g openclaw@latest
openclaw --version
openclaw mcp --help
```

Relevant subcommands: **`openclaw mcp list`**, **`set`**, **`show`**, **`unset`**, **`serve`**. Syntax for **`set`** is covered in §5.

Full OpenClaw onboarding (gateway, channels, **`openclaw configure`**) is **upstream** — follow **`openclaw --help`** and your installed version’s docs. **Registering ClawQL MCP** is independent: once **`openclaw mcp set`** succeeds, agents that read OpenClaw’s MCP config can use ClawQL tools when the runtime loads them.

---

## 4. Run ClawQL (pick one transport)

### 4.1 Streamable HTTP (recommended for first tests)

From a **ClawQL git checkout** after **`npm run build`**:

```bash
PORT=8080 npm run start:http
```

- Health: **`GET http://127.0.0.1:8080/healthz`**
- MCP: **`http://127.0.0.1:8080/mcp`** — path **must** be **`/mcp`**.

Published package equivalent:

```bash
PORT=8080 npx -p clawql-mcp clawql-mcp-http
```

See **[`docs/readme/deployment.md`](../readme/deployment.md)** for **`PORT`**, **`MCP_PATH`**, TLS termination, and reverse proxies.

### 4.2 stdio

```bash
npx -y clawql-mcp
```

Or from source:

```bash
node dist/server.js
```

Same MCP protocol as Cursor’s stdio config — see **`.cursor/mcp.json.example`** at repo root.

---

## 5. Register ClawQL in OpenClaw (`openclaw mcp set`)

OpenClaw **2026.x** uses:

```text
openclaw mcp set <server-name> '<json>'
```

Config is stored under **`~/.openclaw/openclaw.json`** (see **`openclaw mcp show`** output on your machine).

### 5.1 HTTP — ClawQL on localhost

With **`PORT=8080 npm run start:http`** running:

```bash
openclaw mcp set clawql '{"url":"http://127.0.0.1:8080/mcp"}'
openclaw mcp show clawql
openclaw mcp list
```

Use **`https://`** when TLS terminates in front of ClawQL (Ingress, Tailscale Serve, etc.).

### 5.2 stdio — published `clawql-mcp`

```bash
openclaw mcp set clawql '{"command":"npx","args":["-y","clawql-mcp"]}'
```

### 5.3 stdio — development build from repo

```bash
openclaw mcp set clawql-dev "{\"command\":\"node\",\"args\":[\"/absolute/path/to/ClawQL/dist/server.js\"]}"
```

Set **`cwd`** in JSON only if your OpenClaw version supports it (check **`openclaw mcp set --help`**).

### 5.4 Passing **`CLAWQL_*`** env (same idea as Cursor)

Embed an **`env`** object mirroring **`mcp.json`** (single-line JSON is easiest to paste):

```bash
openclaw mcp set clawql '{"command":"npx","args":["-y","clawql-mcp"],"env":{"CLAWQL_PROVIDER":"github","CLAWQL_BUNDLED_OFFLINE":"1","CLAWQL_OBSIDIAN_VAULT_PATH":"/path/to/writable/vault"}}'
```

For HTTP, env vars normally apply to the **ClawQL process** (your **`start:http`** shell), not inside the JSON — export them before **`npm run start:http`**.

### 5.5 Remove or rename

```bash
openclaw mcp unset clawql
```

---

## 6. Validate without OpenClaw UI

From the **ClawQL** repo:

```bash
npm run build
CLAWQL_OPENCLAW_BOOTSTRAP_TOOLS_ONLY=1 npm run smoke:openclaw-bootstrap
```

Expect **`OK (tools-only)`**. Full smoke (**`search` → `execute`** GitHub list commits) needs network + token:

```bash
npm run smoke:openclaw-bootstrap
```

---

## 7. Validate through OpenClaw

Use the **manual checklist** in **`clawql-bootstrap.md`** (section _Manual checklist (OpenClaw → ClawQL)_). Minimal meaningful test:

1. Ensure ClawQL HTTP is up (or stdio server reachable).
2. Confirm **`openclaw mcp show clawql`** matches what you expect.
3. In OpenClaw, drive a prompt that performs **`search`** then **`execute`** (e.g. GitHub **`repos/list-commits`**) with lean **`fields`**.

If tools never appear, verify **`listTools`** via MCP Inspector or the smoke script — isolate **ClawQL** before debugging OpenClaw routing.

---

## 8. Remote access (Kubernetes, Tailscale, HTTPS)

- **Cluster:** Point **`url`** at your Ingress / LoadBalancer **`https://clawql.example.com/mcp`**. Align **`CLAWQL_*`** with **[`docs/deployment/helm.md`](../deployment/helm.md)**.
- **Tailnet:** **[`docs/deployment/tailscale-and-headscale-for-clawql.md`](../deployment/tailscale-and-headscale-for-clawql.md)** — MagicDNS **`https://…ts.net/mcp`**, firewall, **`CLAWQL_MCP_URL`** hygiene.

---

## 9. Document / IDP workflows

After basic **`search` / `execute`** works, follow **[`openclaw-idp-skill-profile.md`](openclaw-idp-skill-profile.md)** for ingest → transform → archive patterns (**`ingest_external_knowledge`**, Paperless, Onyx, vault memory).

---

## 10. Observability

ClawQL exposes **`GET /metrics`** on **`clawql-mcp-http`**. Grafana import and Prometheus scrape are documented in **[`docs/grafana/README.md`](../grafana/README.md)**. Embedding Grafana inside OpenClaw’s UI is tracked under **[#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225)** / **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)** — not required for MCP correctness.

---

## 11. Troubleshooting

| Symptom                                         | What to check                                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **`openclaw: command not found`**               | **`npm install -g openclaw`**; ensure global npm **`bin`** is on **`PATH`**.                                                                    |
| **Connection refused** to HTTP MCP              | ClawQL process running; **`PORT`**; firewall.                                                                                                   |
| **404 / wrong path**                            | URL must end with **`/mcp`** (Streamable HTTP).                                                                                                 |
| **Tools missing**                               | **`CLAWQL_ENABLE_*`** hides optional tools; rebuild/restart ClawQL.                                                                             |
| **GitHub 401 on execute**                       | **`CLAWQL_BEARER_TOKEN`** / **`gh auth token`**.                                                                                                |
| **`listTools` OK in smoke but not in OpenClaw** | OpenClaw config not loaded for that profile; try **`openclaw mcp list`**; check **`--profile`** / **`OPENCLAW_CONFIG_PATH`** per OpenClaw docs. |

---

## 12. Related documentation

| Doc                                                              | Topic                             |
| ---------------------------------------------------------------- | --------------------------------- |
| [`clawql-bootstrap.md`](clawql-bootstrap.md)                     | Smoke script, condensed checklist |
| [`openclaw-idp-skill-profile.md`](openclaw-idp-skill-profile.md) | IDP provider matrix               |
| [`docs/mcp-tools.md`](../mcp-tools.md)                           | MCP tool catalog                  |
| [`docs/readme/configuration.md`](../readme/configuration.md)     | **`CLAWQL_*`** reference          |
| [`docs/readme/deployment.md`](../readme/deployment.md)           | HTTP / gRPC deployment            |
