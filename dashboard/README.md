# ClawQL dashboard

Small Next.js app (same brand styling as `website/`) that renders every key from the repo **`.env.example`** (via generated `src/generated/env-catalog.json`) and can **read/write Vault KV values**, then **`kubectl rollout restart`** the MCP deployment so pods reload env values.

## Run locally

```bash
cd dashboard
npm install
npm run dev
```

Open [http://localhost:3040](http://localhost:3040).

### Agent Chat + OpenClaw (local)

The **Agent Chat** panel calls `POST /api/agent/chat`, which proxies to **`CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL`** when set. OpenClaw itself is the **`openclaw` CLI** (WebSocket gateway + `openclaw agent`); it does **not** ship an HTTP `POST /v1/chat` endpoint, so this repo includes a tiny bridge.

1. **Install and configure OpenClaw** (model/API keys): see [`docs/openclaw/using-openclaw-with-clawql.md`](../docs/openclaw/using-openclaw-with-clawql.md). Default agent id is usually **`main`** (`openclaw agents list`).
2. **Start the bridge** (terminal 1):

   ```bash
   cd dashboard
   npm run openclaw:chat-bridge
   ```

   Default URL printed: **`http://127.0.0.1:8787/v1/chat`**. Override port with **`OPENCLAW_CHAT_BRIDGE_PORT`**. Override agent with **`CLAWQL_OPENCLAW_AGENT_ID`** (default **`main`**).

3. **Run the dashboard with the env var** (terminal 2):

   ```bash
   cd dashboard
   CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL=http://127.0.0.1:8787/v1/chat npm run dev
   ```

4. Open **Agent Chat** in the UI; messages go to `openclaw agent --local` per request. **Chat history** is written under **`$CLAWQL_OBSIDIAN_VAULT_PATH/Dashboard/chats/`** (default **`~/.ClawQL/Dashboard/chats/`**) so you can reopen threads and continue with the same **`threadId`** for OpenClaw.

### Vault layout (dashboard data)

```
~/.ClawQL/                          # CLAWQL_OBSIDIAN_VAULT_PATH (default)
  Memory/                           # memory_ingest / memory_recall notes
  memory.db                         # hybrid recall sidecar
  Dashboard/
    chats/
      index.json                    # thread list
      threads/
        thread-<ms>/
          meta.json                 # title, createdAt, updatedAt
          messages.jsonl            # conversation (one JSON object per line)
          activity.jsonl            # per-thread API events
    logs/
      agent-chat.jsonl              # cross-thread chat API log
```

Existing browser **localStorage** chats are **imported once** into the vault on first load when the vault index is empty.

| Variable | Purpose |
| -------- | ------- |
| `CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL` | Full URL to POST chat JSON (use bridge URL above for local dev). |
| `CLAWQL_OBSIDIAN_VAULT_PATH` | Obsidian vault root for dashboard chat persistence (default **`~/.ClawQL`**). Chats live under **`Dashboard/chats/`**; API logs under **`Dashboard/logs/`**. Same path as ClawQL MCP **`memory_*`** tools. |
| `OPENCLAW_CHAT_BRIDGE_PORT` | Bridge listen port (default **8787**). |
| `CLAWQL_OPENCLAW_AGENT_ID` | `openclaw agent --agent` id (default **main**). |
| `OPENCLAW_AGENT_TIMEOUT_SEC` | Per-message CLI timeout in seconds (default **120**). |

**OpenRouter:** add **`OPENROUTER_API_KEY`** to repo **`.env`** (the bridge loads repo-root `.env` for unset keys) **or** run **`openclaw models auth paste-token --provider openrouter`**. Then set a default OpenRouter-backed model (**`openclaw models list --all --provider openrouter`** then **`openclaw models set …`**) so inference is not still pinned to **`openai/*`** (see **`docs/openclaw/using-openclaw-with-clawql.md`** §5.6).

**Kubernetes / Rancher:** do not rely on `.env` in the image — set **`dashboard.openclawChatUrl`** in Helm so the Deployment gets **`CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL`**, or leave it empty when **`openclaw.chatBridge.enabled`** (default) auto-wires to the OpenClaw sidecar (`http://<release>-openclaw.<ns>.svc.cluster.local:8787/v1/chat`). Start from **`charts/clawql-mcp/values-rancher.example.yaml`** and **`docs/deployment/helm.md`**.

Dev and production builds use **webpack** (`--webpack`) so file tracing stays predictable inside the ClawQL monorepo; `next.config.mjs` sets `outputFileTracingRoot` to the repo root when multiple lockfiles are present.

Regenerate the catalog from `.env.example` anytime:

```bash
npm run catalog
```

## Server environment (API safety)

In local dev (`npm run dev`), Kubernetes sync defaults to **enabled** unless explicitly turned off with
`CLAWQL_DASHBOARD_ALLOW_K8S_SYNC=0`. In production (`npm run build && npm run start`), it stays **off** unless
`CLAWQL_DASHBOARD_ALLOW_K8S_SYNC=1` is set. Enable it only on a trusted machine that already has **`kubectl`** access.

| Variable | Purpose |
|----------|---------|
| `CLAWQL_DASHBOARD_ALLOW_K8S_SYNC` | Must be **`1`** for `GET /api/k8s/secret-env` (Vault prefill) and `POST /api/k8s/sync-secret` (Vault save + rollout). |
| `CLAWQL_DASHBOARD_SYNC_TOKEN` | If set, clients must send `Authorization: Bearer <same value>`. |
| `KUBE_CONTEXT` | Optional; passed to kubectl as `--context`. |
| `CLAWQL_DASHBOARD_K8S_NAMESPACE` | Default namespace (default **`clawql`**). |
| `CLAWQL_DASHBOARD_K8S_SECRET_NAME` | Form field default only (legacy label retained in API route names). |
| `CLAWQL_DASHBOARD_K8S_DEPLOYMENT` | Default Deployment (default **`clawql-mcp-http`**). |
| `CLAWQL_DASHBOARD_VAULT_NAMESPACE` | Vault pod namespace used for `kubectl exec` (default **`clawql`**). |
| `CLAWQL_DASHBOARD_VAULT_POD` | Vault pod name (default **`clawql-hashicorpvault-0`**). |
| `CLAWQL_DASHBOARD_VAULT_ADDR` | Vault address used inside pod exec (default **`http://127.0.0.1:8200`**). |
| `CLAWQL_DASHBOARD_VAULT_MOUNT` | Vault KV mount (default **`secret`**). |
| `CLAWQL_DASHBOARD_VAULT_PATH` | Vault logical path (default **`clawql/dotenv`**). |
| `CLAWQL_DASHBOARD_VAULT_TOKEN` / `VAULT_TOKEN` | Vault token used for read/write (defaults to **`root`** in local dev Vault chart mode). |

Source of truth is Vault KV. If ESO syncs Vault values into Kubernetes Secrets, ESO reconciliation continues on its configured **`refreshInterval`** after dashboard writes.

### Optional public defaults (names only)

These are embedded at **build time** for the form’s initial namespace/secret/deployment fields (not secrets):

- `NEXT_PUBLIC_CLAWQL_DASHBOARD_K8S_NAMESPACE`
- `NEXT_PUBLIC_CLAWQL_DASHBOARD_K8S_SECRET_NAME`
- `NEXT_PUBLIC_CLAWQL_DASHBOARD_K8S_DEPLOYMENT`

## End-to-end tests (real Kubernetes)

Integration tests drive the **browser UI**, call the Next.js API (no mocks), and use **`kubectl`** for cluster lifecycle checks.

**Requirements:** working cluster context (`kubectl` on `PATH`), image pull for `registry.k8s.io/pause:3.9`, and Playwright Chromium installed once via `npx playwright install chromium`.

```bash
cd dashboard
npm install
npx playwright install chromium
CLAWQL_DASHBOARD_E2E=1 npm run test:e2e
```

Optional overrides: `CLAWQL_DASHBOARD_E2E_NAMESPACE`, `CLAWQL_DASHBOARD_E2E_DEPLOYMENT`, `CLAWQL_DASHBOARD_E2E_SECRET_NAME`, `KUBE_CONTEXT`.

Without `CLAWQL_DASHBOARD_E2E=1`, the spec is **skipped** (no dev server started).

When `CLAWQL_DASHBOARD_E2E=1`, Playwright runs **`npm run build` + `next start`** on **port 3041** (with `CLAWQL_DASHBOARD_ALLOW_K8S_SYNC=1`) so it does not fight `.next/dev/lock` from a separate `npm run dev` on **3040**.

## Behavior

- The form **loads current Vault KV values** for catalog keys on load and after successful save.
- **Save** sends only **diffs** vs that snapshot: changed non-empty keys are written, and cleared keys are removed from Vault. Then **`kubectl rollout restart`** runs so pods pick up changes.
- Sensitive catalog keys use a **password** field with an **eye** toggle to reveal locally.
- Supports pasting a full `.env` blob into any field; matching keys auto-populate in one shot.
- **High privilege**: do not expose this app to the internet without authentication and network controls.
