# Cloud Agent e2e: ClawQL + R2 team memory

Verified path to get **ClawQL MCP**, **local vault memory**, and **Cloudflare R2 remote sync** working on a **Cursor Cloud Agent**. Use this when onboarding a new teammate or debugging a fresh environment.

**Related:** [Agent setup — Cursor iOS / Cloud Agent](./agent-setup.md#cursor-i-os-cloud-agent) · [For teams — vault sync](./getting-started-for-teams.md#team-vault-sync) · [Cloud Agent + R2 + Tailscale runbook](../deployment/cloud-agent-r2-tailscale-runbook.md)

---

## What you get when this works

| Layer        | Location                                          | Durable across VMs?                |
| ------------ | ------------------------------------------------- | ---------------------------------- |
| Local vault  | `CLAWQL_HOME` (default `/home/ubuntu/.ClawQL`)    | No (ephemeral VM disk)             |
| Memory notes | `CLAWQL_HOME/Memory/*.md`                         | Only after R2 sync                 |
| Team bucket  | `r2://clawql-team-vault/teams/shared/` (defaults) | Yes                                |
| MCP tools    | `memory_ingest` / `memory_recall` / `memory_sync` | Process-local; sync persists notes |

Secrets and provider tokens stay in **Cursor Secrets** or `vault/providers.json` — **never** in the R2 bucket or git.

---

## Prerequisites checklist

### 0. Enable ClawQL MCP on Cloud Agents (most common failure)

A new chat that says **“ClawQL `memory_recall` is not available”** / only **`cursor-cloud`** is attached means the **clawql** MCP server was not enabled for that run.

| Surface        | What to do                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Personal / iOS | [cursor.com/agents](https://cursor.com/agents) → MCP → add **clawql** (stdio) → toggle **on** for the run                        |
| Team admins    | [Dashboard → Integrations & MCP](https://cursor.com/dashboard/integrations) → add shared **clawql**, then enable it on the agent |

Stdio config to paste:

```json
{
  "command": "npx",
  "args": ["-y", "clawql-mcp"],
  "env": {
    "CLAWQL_HOME": "/home/ubuntu/.ClawQL"
  }
}
```

**Do not use** `npx -p clawql-mcp clawql-mcp` — on Cloud Agents it fails live tool discovery with `clawql-mcp: not found`.

Repo **`.cursor/mcp.json`** helps the IDE and the install hook; **Cloud Agent tool calls still require the dashboard/MCP toggle** with the working args above. After enabling, start a **new** agent (or re-run) and wait for install so R2 auto-pull can fill `Memory/`.

### 1. Cloudflare account

1. **Enable R2** in the Cloudflare dashboard (R2 → subscribe / purchase — free tier is enough).  
   Until R2 is enabled, `clawql sync ensure` fails with Cloudflare error **10042**: _Please enable R2 through the Cloudflare Dashboard._
2. Note your **Account ID** (32-char hex) — used as `CLAWQL_R2_ACCOUNT_ID`.
3. Create an **R2 S3 API token**: **R2 → Manage R2 API Tokens**.
   - Prefer **Admin Read & Write** so ensure can create buckets via the S3 API.
   - **Object Read & Write** is enough once the bucket exists.
4. Optional but useful: an **Account API token** (e.g. named `ClawQL-CI`) with at least:
   - **Workers R2 Storage: Write** — lets `sync ensure` create the bucket via Cloudflare REST when S3 keys lack CreateBucket
   - **Account Settings: Read**
   - Other Workers scopes are fine if you reuse the token for CI; they are not required for memory sync

### 2. Cursor Cloud Agent secrets

**Cursor → Cloud Agents → Secrets** (injected into every run for the repo):

| Secret                           | Required?   | Notes                                               |
| -------------------------------- | ----------- | --------------------------------------------------- |
| `CLAWQL_R2_ACCOUNT_ID`           | Yes         | Cloudflare account id (no spaces/newlines)          |
| `CLAWQL_SYNC_ACCESS_KEY_ID`      | Yes         | R2 S3 access key — **trim whitespace** when pasting |
| `CLAWQL_SYNC_SECRET_ACCESS_KEY`  | Yes         | R2 S3 secret                                        |
| `CLOUDFLARE_API_TOKEN`           | Recommended | Account token with Workers R2 Storage Write         |
| `CLAWQL_HOME`                    | Optional    | Default `/home/ubuntu/.ClawQL` on Cloud Agent VMs   |
| `CLAWQL_SYNC_BUCKET`             | Optional    | Default `clawql-team-vault`                         |
| `CLAWQL_SYNC_PREFIX`             | Optional    | Default `teams/shared/`                             |
| `CLAWQL_SYNC_AUTO`               | Optional    | `1` — debounced push after `memory_ingest`          |
| `CLAWQL_SYNC_AUTO_PULL`          | Optional    | `1` — throttled pull before `memory_recall`         |
| `CLAWQL_SYNC_AUTO_PULL_ON_START` | Optional    | `1` — pull when MCP starts                          |

**Paste hygiene:** trailing spaces or newlines on `CLAWQL_SYNC_ACCESS_KEY_ID` break auth after TLS works. Re-save the secret if `len` is not 32 for a typical R2 access key.

Provider tokens (GitHub, Slack, …) are optional for memory sync; without them `doctor --smoke` skips `execute`.

### 3. Repo wiring (this repository already has it)

| File                              | Role                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `.cursor/environment.json`        | Runs `.cursor/scripts/cloud-agent-install.sh` on VM setup                                                                    |
| `.cursor/mcp.json` (+ `.example`) | Stdio `clawql-mcp` for IDE / install; **also register the same server in the Cloud Agents MCP UI**                           |
| Install script                    | `npm ci` + `npm run build`, creates `~/.ClawQL`, runs `sync ensure` / `pull` when secrets exist, writes `~/.cursor/mcp.json` |

---

## End-to-end procedure

Run these on the Cloud Agent (or ask the agent to run them). Wait for the **install** hook to finish (`npm run build`) before calling `bin/clawql.mjs` if `dist/` is missing.

### Step A — Doctor

```bash
node bin/clawql.mjs doctor
# optional deeper check:
node bin/clawql.mjs doctor --smoke
```

Expect: Node ≥ 22, ClawQL home, Obsidian vault path, config present. Warnings about missing provider secrets are OK for a memory-only smoke.

### Step B — Ensure the team bucket

```bash
node bin/clawql.mjs sync ensure --yes --provider r2 \
  --bucket clawql-team-vault --prefix teams/shared/
```

Success looks like:

```text
Team sync ensured
  Bucket:   clawql-team-vault
  Prefix:   teams/shared/
  Status:   created via cloudflare-api   # or already-exists
```

Writes `~/.ClawQL/sync.json` (bucket/prefix only — credentials stay in env/secrets).

### Step C — Pull (may be empty on first run)

```bash
node bin/clawql.mjs sync pull
```

### Step D — Memory ingest + recall

Prefer MCP tools when the **clawql** server is enabled for the run:

```json
// memory_ingest
{
  "title": "Cloud Agent ClawQL E2E Probe",
  "type": "context",
  "insights": "## Summary\nShort test note from Cloud Agent enablement.\n",
  "sessionId": "cloud-agent-e2e-enable"
}
```

```json
// memory_recall
{
  "query": "Cloud Agent ClawQL E2E Probe",
  "limit": 5,
  "maxDepth": 1
}
```

If MCP tools are not registered in the agent session (only `cursor-cloud` visible), enable **clawql** in the Cloud Agent MCP UI, or invoke the local server over stdio from the built repo (`dist/server.js`) with `CLAWQL_HOME` set. Config files alone do not attach tools mid-run.

### Step E — Push / memory_sync

```bash
node bin/clawql.mjs sync push
node bin/clawql.mjs sync status
```

Or via MCP:

```json
// memory_sync
{ "direction": "auto" }
```

`auto` = pull remote, then push local. Healthy status:

```text
Team sync: r2://clawql-team-vault/teams/shared/
  local files:  N
  remote files: N
  in sync:      N
  conflicts:    0
```

---

## Session workflow (after day-one)

1. **Start** — auto-pull on MCP start (if `CLAWQL_SYNC_AUTO_PULL_ON_START=1`), or `memory_sync` `{ "direction": "pull" }`.
2. **Work** — `memory_recall` → `search` / `execute` → `memory_ingest` for durable outcomes.
3. **End** — `memory_sync` `{ "direction": "auto" }` so the next VM sees the notes.

---

## Copy-paste agent prompt

```
Enable ClawQL end-to-end on this Cloud Agent:
1. Wait for install/build if dist/ is missing, then: node bin/clawql.mjs doctor
2. node bin/clawql.mjs sync ensure --yes
3. node bin/clawql.mjs sync pull
4. memory_ingest a short test note, then memory_recall for it
5. memory_sync with direction auto (or clawql sync push)
Report what succeeded and any missing secrets.
Never print secret values. If R2 returns 10042, tell me to enable R2 in the Cloudflare dashboard.
If TLS to {accountId}.r2.cloudflarestorage.com fails right after enabling R2, wait and retry — do not rotate keys unless paste whitespace is wrong.
```

---

## Troubleshooting (from a real enablement)

| Symptom                                                                                    | Cause                                                                                          | Fix                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot find module '.../dist/onboarding/cli.js'`                                          | Install/build not finished                                                                     | Wait for `.cursor/scripts/cloud-agent-install.sh` / `npm run build`                                                                                        |
| `sync ensure` → Cloudflare **10042**                                                       | R2 product not enabled on the account                                                          | Dashboard → R2 → complete purchase/subscribe, then retry ensure                                                                                            |
| `sync ensure` OK via `cloudflare-api`, but `push`/`pull` → `sslv3 alert handshake failure` | Account S3 hostname not ready yet, or bad network path to `{account}.r2.cloudflarestorage.com` | Wait a few minutes after enabling R2 and retry; confirm Account ID; do **not** require a key rotation if REST bucket create already worked                 |
| Access key `len=34` for a 32-char key                                                      | Trailing whitespace in Cursor Secret                                                           | Re-paste `CLAWQL_SYNC_ACCESS_KEY_ID` with no spaces/newlines                                                                                               |
| `Sync bucket not configured`                                                               | No `sync.json` / ensure never succeeded                                                        | Run `sync ensure --yes` (or `sync init --bucket …` if the bucket already exists)                                                                           |
| MCP catalog has no `memory_*` / “not available in this cloud-agent run”                    | **clawql** not enabled in Cloud Agents MCP UI                                                  | Add + toggle **clawql** at [cursor.com/agents](https://cursor.com/agents) (or team Integrations); start a **new** run; repo `mcp.json` alone is not enough |
| ClawQL MCP “failed during live tool discovery”                                             | Broken stdio launch: `npx -p clawql-mcp clawql-mcp`                                            | Edit MCP to **`npx -y clawql-mcp`** (see §0); remove the old server and re-add; start a new run                                                            |
| New chat has empty vault / no `mcp.json` yet                                               | Install still running or first boot                                                            | Wait for install; secrets must allow `sync pull`; then `memory_sync` `{ "direction": "pull" }`                                                             |
| `doctor` warns about GitHub/Slack/…                                                        | Provider vault empty                                                                           | Optional for memory sync; add tokens via Secrets or `clawql secrets set` for `execute`                                                                     |
| REST upload to R2 works, S3 SDK fails                                                      | Same as TLS row — ClawQL sync uses the S3-compatible endpoint                                  | Fix S3 endpoint TLS/credentials; REST success only proves the bucket exists                                                                                |

### Quick TLS probe (no secrets printed)

```bash
# After CLAWQL_R2_ACCOUNT_ID is set in the environment:
HOST="${CLAWQL_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
curl -4 -sS -o /dev/null -w 'http=%{http_code} err=%{errormsg}\n' --connect-timeout 10 "https://${HOST}/"
# Healthy enough for sync: HTTP 400 (unsigned) or similar — not curl (35) handshake failure
```

---

## Verification matrix (done once on ClawQL Cloud Agents)

| Check                                   | Expected                                        |
| --------------------------------------- | ----------------------------------------------- |
| `clawql doctor` / `--smoke`             | Exit 0; tools/list + search pass                |
| `sync ensure`                           | Bucket `clawql-team-vault` exists               |
| `memory_ingest`                         | Note under `Memory/*.md`                        |
| `memory_recall`                         | Hits that note                                  |
| `sync push` then `sync status`          | Local and remote file counts match, conflicts 0 |
| `memory_sync` `{ "direction": "auto" }` | `ok: true`, conflicts empty                     |

---

## What not to commit

- Secret values, API tokens, or raw `clawql.env` with credentials
- Contents of `~/.ClawQL/vault/providers.json`
- R2 object payloads that contain secrets

Safe to document and share: bucket name defaults, prefix, secret **names**, Cloudflare permission labels, and this procedure.
