# Agent setup

Vault-first onboarding, Cursor iOS Cloud Agents, and the local agent sandbox (macOS Seatbelt).

## Pick your path

| You are…                             | Jump to                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Setting up Cursor or Claude Desktop  | [Desktop / stdio](#desktop-stdio-recommended)                                                                    |
| On Cursor iOS / Cloud Agent          | [Cursor iOS + Cloud Agent](#cursor-ios-cloud-agent)                                                              |
| Hardening local agent shell on macOS | [Local agent sandbox](#local-agent-sandbox-macos-seatbelt)                                                       |
| Private mesh / ephemeral transport   | [Networking](#networking-optional) · [clawql-network spec](https://docs.clawql.com/specs/network/clawql-network) |
| Sharing vault notes with a team      | [For teams — vault sync](https://docs.clawql.com/getting-started/for-teams#team-vault-sync)                      |

---

## Desktop / stdio (recommended)

Vault-first onboarding: one home for memory, provider secrets, and MCP wiring — better than pasting API keys into client config.

**One command (end-to-end):**

```bash
npx -p clawql-mcp clawql onboard --interactive
```

Or step by step:

```bash
npx -p clawql-mcp clawql init --interactive   # ~/.ClawQL + vault/providers.json
npx -p clawql-mcp clawql mcp-config --write cursor
npx -p clawql-mcp clawql doctor --smoke
```

Provider tokens live in **`~/.ClawQL/vault/providers.json`** (same KV shape as HashiCorp **`secret/clawql/providers`**). Memory tools use **`~/.ClawQL/Memory/`** via **`CLAWQL_OBSIDIAN_VAULT_PATH`**.

Default install loads an **empty provider catalog** — no bundled vendors until you opt in. Set **`CLAWQL_PROVIDER=default`** for the opinionated stack (Cloudflare, GitHub, Slack, Linear, Notion, Onyx), or **`CLAWQL_PROVIDER=all-providers`** for every bundled vendor plus Google top-50 and AWS top-50.

Restart Cursor or Claude Desktop after MCP config is written.

### Networking (optional)

For Headscale mesh + governed Tailcat ephemeral links (ATR-gated audit on tailcat connects), run:

```bash
npx -p clawql-mcp clawql init --networking
# or: clawql network init
clawql network verify
```

See [clawql-network](https://docs.clawql.com/specs/network/clawql-network) and the [Tailscale / Headscale guide](https://docs.clawql.com/tailscale).

### Copy-paste prompt (desktop)

```
You are helping me set up ClawQL (MCP server for API search + execute over OpenAPI/Discovery specs).

Goals:
1. Run vault-first onboarding:
   npx -p clawql-mcp clawql onboard --interactive
   (or: clawql init --interactive → clawql mcp-config --write cursor → clawql doctor --smoke)
2. Choose deployment if not using stdio: (A) local stdio (default), (B) local HTTP clawql-mcp-http, or (C) Kubernetes Helm — ask if unclear.
3. Never put API tokens in mcp.json or git. Secrets go in ~/.ClawQL/vault/providers.json (local) or HashiCorp Vault secret/clawql/providers (K8s). Use clawql init --from-env .env to import, then remove secrets from repo .env. Add keys later with: clawql secrets set github
4. MCP config is written to Cursor/Claude automatically by onboard; otherwise use clawql mcp-config --write cursor. Remind me to restart the MCP client.
5. Pick ONE default-stack vendor to smoke-test with search + read-only execute (GitHub, Slack, Linear, Notion, Onyx, or Cloudflare).
6. Confirm memory_ingest works: CLAWQL_OBSIDIAN_VAULT_PATH should be ~/.ClawQL after init.

Important facts:
- Default install: empty provider catalog (no bundled vendors until opt-in).
- Opinionated stack (opt-in): CLAWQL_PROVIDER=default = Cloudflare, GitHub, Slack, Linear, Notion, Onyx.
- Full bundle: CLAWQL_PROVIDER=all-providers.
- MCP loads ~/.ClawQL/clawql.env + vault/providers.json at startup (no secrets in MCP JSON).
- K8s: make local-k8s-up then clawql init --push-vault with VAULT_TOKEN set.
- Docs: https://docs.clawql.com/agent-setup https://docs.clawql.com/quickstart

Do not invent API responses. On auth failure, point to vault/providers.json or docs/providers/*-onboarding.md.

When done, summarize: home path, secrets vault path, MCP transport, vendor tested, memory vault status.
```

### Local vs cluster secrets

| Mode            | Secrets store                                            |
| --------------- | -------------------------------------------------------- |
| **Local stdio** | `~/.ClawQL/vault/providers.json` (loaded at MCP startup) |
| **Kubernetes**  | HashiCorp Vault → ESO → `clawql-provider-env`            |
| **Dashboard**   | Provider secrets UI → Vault KV                           |

Guide: [local-provider-vault.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/local-provider-vault.md)

### Health check (HTTP)

```bash
PORT=8080 npx -p clawql-mcp clawql-mcp-http
CLAWQL_MCP_URL=http://127.0.0.1:8080 npx -p clawql-mcp clawql doctor
```

---

## Cursor iOS + Cloud Agent

Use ClawQL from the Cursor iOS app by running Cloud Agents with stdio MCP on the agent VM and a team vault bucket (R2, S3, or GCS) for memory that survives across sessions.

On macOS/Windows, Cursor can run `npx clawql-mcp` locally over stdio with `~/.ClawQL` on disk. The iOS app has no local shell, no stdio MCP subprocess, and no persistent `~/.ClawQL` on the phone — Cloud Agents provide the runtime instead.

**Related:** [For teams — Team vault sync](https://docs.clawql.com/getting-started/for-teams#team-vault-sync) · [MCP clients](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/readme/deployment.md)

### Architecture

```text
Cursor iOS app
      │
      ▼
Cloud Agent VM (Cursor-managed)
├── stdio MCP: npx -p clawql-mcp clawql-mcp
├── CLAWQL_HOME=/home/ubuntu/.ClawQL  (ephemeral VM disk)
└── memory_sync ◄──► object storage (R2 / S3 / GCS)
      │
      ▼
Next Cloud Agent session (new VM) — pull same bucket prefix
```

- MCP runs inside the Cloud Agent VM, not on the phone.
- `Memory/` Markdown is the durable source of truth; `memory.db` is rebuilt per VM.
- `vault/providers.json` (API tokens) stays on the VM or in Cursor Secrets — never in the sync bucket.

### Prerequisites

1. **Object-storage bucket** with a team prefix (R2 quick start: [For teams — R2](https://docs.clawql.com/getting-started/for-teams#quick-start-r2)).
2. **Cursor Cloud Agents** enabled for your account (repo connected in the Cursor dashboard).
3. **`clawql-mcp`** on the agent VM — `npx -p clawql-mcp` resolves it at MCP startup (Node.js is preinstalled on Cloud Agent VMs).

One-time bucket setup can be done from a desktop machine with the ClawQL CLI:

```bash
clawql sync init --interactive
clawql sync push   # seed Memory/ from an existing ~/.ClawQL
```

### 1. Cursor dashboard secrets

Add these under **Cursor → Settings → Cloud → Secrets** (or your team's secret store). They are injected into every Cloud Agent run for the repo.

| Secret                           | Purpose                                           |
| -------------------------------- | ------------------------------------------------- |
| `CLAWQL_HOME`                    | Vault root on the VM, e.g. `/home/ubuntu/.ClawQL` |
| `CLAWQL_R2_ACCOUNT_ID`           | Cloudflare account id (R2 endpoint)               |
| `CLAWQL_SYNC_BUCKET`             | Team bucket name                                  |
| `CLAWQL_SYNC_PREFIX`             | Shared prefix, e.g. `teams/engineering/`          |
| `CLAWQL_SYNC_ACCESS_KEY_ID`      | R2 S3 API access key                              |
| `CLAWQL_SYNC_SECRET_ACCESS_KEY`  | R2 S3 API secret                                  |
| `CLAWQL_SYNC_AUTO`               | `1` — debounced push after `memory_ingest`        |
| `CLAWQL_SYNC_AUTO_PULL`          | `1` — throttled pull before `memory_recall`       |
| `CLAWQL_SYNC_AUTO_PULL_ON_START` | `1` — pull once when MCP starts                   |

For S3 or GCS, use the credential variables from [For teams — Environment](https://docs.clawql.com/getting-started/for-teams#environment) instead of R2 keys.

Provider API tokens (GitHub, Slack, Cloudflare, etc.) also belong in Secrets — same keys as local `clawql secrets set`, loaded via `CLAWQL_HOME` / `clawql.env`. Tokens should not go in `mcp.json` or git.

### 2. Connect ClawQL MCP (stdio)

Cloud Agents use the repo's MCP configuration. Add `.cursor/mcp.json` (or enable the clawql server in the agent run UI):

```json
{
  "mcpServers": {
    "clawql": {
      "command": "npx",
      "args": ["-p", "clawql-mcp", "clawql-mcp"],
      "env": {
        "CLAWQL_HOME": "/home/ubuntu/.ClawQL"
      }
    }
  }
}
```

`CLAWQL_HOME` in `env` can match the dashboard secret; dashboard secrets are also visible to the MCP child process.

On a desktop machine you can generate the same JSON:

```bash
npx -p clawql-mcp clawql mcp-config --write cursor
```

Enable the clawql MCP server when starting a Cloud Agent from iOS (the server must be toggled on per run if your client requires it).

### 3. Bootstrap the vault on the VM

The first Cloud Agent run creates an empty `CLAWQL_HOME` on VM disk. Choose one bootstrap path:

#### A. Pull existing team memory (recommended)

With sync secrets set, MCP auto-pull on start fetches `Memory/` from the bucket. Or ask the agent to call `memory_sync` with `{ "direction": "pull" }`.

#### B. Agent-guided init

Paste the desktop copy-paste prompt above into a Cloud Agent run. The agent can run:

```bash
npx -p clawql-mcp clawql init --interactive
```

Provider secrets should come from Cursor Secrets rather than interactive prompts when possible.

#### C. Optional repo install hook

Teams can add `.cursor/environment.json` with an install script that runs `clawql init`, writes `sync.json`, or pre-installs `clawql-mcp` before the agent starts. Keep secrets out of the script — use dashboard Secrets only.

### 4. Session workflow (memory)

| Step                  | Tool / behavior                                                                     |
| --------------------- | ----------------------------------------------------------------------------------- |
| Start session         | Auto-pull on MCP start (if `CLAWQL_SYNC_AUTO_PULL_ON_START=1`)                      |
| Recall context        | `memory_recall` with a focused query                                                |
| Persist outcomes      | `memory_ingest` after decisions, debugging, or API contracts                        |
| End of session        | `memory_sync` with `{ "direction": "auto" }` — pull remote changes, then push local |
| Next session (new VM) | Auto-pull → `memory_recall` sees prior notes                                        |

`memory_sync` replaces shell `clawql sync push` / `pull` on Cloud Agents. See [For teams — `memory_sync`](https://docs.clawql.com/getting-started/for-teams#memory-sync-mcp-tool).

Auto sync (`CLAWQL_SYNC_AUTO=1`) waits a short quiet period after ingest (default **2s**), then rate-limits pushes (default **30s** min interval) so sustained sessions do not hammer R2. Pending dirty writes still **flush on MCP shutdown** (SIGINT/SIGTERM/`beforeExit`) so Cloud Agent exits do not drop notes. Call `memory_sync` at the end of important runs to flush immediately and reconcile conflicts.

### 5. Copy-paste prompt (iOS / Cloud Agent)

```
You are helping me use ClawQL from Cursor on iOS via a Cloud Agent.

Facts:
- MCP is stdio: npx -p clawql-mcp clawql-mcp with CLAWQL_HOME on the agent VM.
- There is no local ~/.ClawQL on my phone; durable memory lives in object storage (R2/S3/GCS).
- Sync credentials are in Cursor Cloud Secrets (CLAWQL_SYNC_* + CLAWQL_R2_ACCOUNT_ID).
- Provider API tokens are in Secrets or CLAWQL_HOME/vault/providers.json — never in mcp.json or git.

Workflow:
1. memory_recall with a concrete query at the start of non-trivial work.
2. search → execute for API operations; memory_ingest for durable outcomes.
3. Before ending the run: memory_sync { "direction": "auto" } to pull then push the team bucket.

If sync is not configured, say so and list which CLAWQL_SYNC_* secrets are missing.
Do not invent API responses. On auth failure, point to vault/providers.json or docs/providers/*-onboarding.md.

Docs: https://docs.clawql.com/agent-setup#cursor-ios-cloud-agent https://docs.clawql.com/getting-started/for-teams#team-vault-sync
```

### Troubleshooting (iOS)

| Symptom                           | Check                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `memory_recall` empty on a new VM | Secrets set? `memory_sync { "direction": "pull" }` or `CLAWQL_SYNC_AUTO_PULL_ON_START=1` |
| `memory_sync` errors              | `CLAWQL_SYNC_BUCKET`, prefix, and R2/S3/GCS credentials in dashboard Secrets             |
| `execute` auth failures           | Provider keys in `vault/providers.json` or matching `CLAWQL_*` env secrets               |
| MCP tools missing                 | Enable clawql server for the Cloud Agent run; confirm `CLAWQL_ENABLE_MEMORY` is not `0`  |
| Conflicts after parallel runs     | `memory_sync` response lists conflicts; use `force: true` only deliberately              |

---

## Local agent sandbox (macOS Seatbelt)

Contain AI coding agents and subagents to company repo paths only — fail-closed, never fail-open.

The Matt Shumer class incident (`rm -rf` after `$HOME` mis-expansion in a subagent) is blocked at the kernel: Seatbelt denies `file-write*` outside explicit allowed paths even when the shell command is wrong.

### One-liner setup

```bash
curl -fsSL https://clawql.com/install | bash
clawql sandbox init
clawql sandbox verify
clawql doctor --smoke          # includes sandbox verify when enabled
clawql codex                   # per-harness sandbox-exec wrapper
```

### Architecture: two layers for Claude Code

| Layer     | Mechanism                                                          |
| --------- | ------------------------------------------------------------------ |
| **Outer** | ClawQL `sandbox-exec -f ~/.ClawQL/sandbox/claude.sb -D WORK_DIR=…` |
| **Inner** | Claude Code native `/sandbox` via `~/.claude/settings.json`        |

Same defense-in-depth idea as Kata + Istio in enterprise — applied locally.

### `clawql sandbox` command surface

```bash
clawql sandbox init              # profiles + Claude settings.json
clawql sandbox status            # per-harness profile paths
clawql sandbox verify            # kernel-level containment probes
clawql sandbox edit --harness claude   # customize profile in $EDITOR
```

#### Per-harness profiles

| Harness    | Profile                         | Notes                                |
| ---------- | ------------------------------- | ------------------------------------ |
| `claude`   | `~/.ClawQL/sandbox/claude.sb`   | Seatbelt wrapper + Claude `/sandbox` |
| `codex`    | `~/.ClawQL/sandbox/codex.sb`    | `sandbox-exec` only                  |
| `cursor`   | `~/.ClawQL/sandbox/cursor.sb`   | `sandbox-exec` only                  |
| `opencode` | `~/.ClawQL/sandbox/opencode.sb` | `sandbox-exec` only                  |

Launch: `clawql <harness>` → `sandbox-exec -f {harness}.sb -D WORK_DIR=$PWD … -- <binary>`

#### Parameterized profile template

Profiles use Seatbelt `(param "…")` filled at launch via `-D`:

```scheme
(version 1)
(allow default)
(deny file-write*)
(allow file-write*
  (subpath "/tmp")
  (subpath (param "WORK_DIR"))
  (subpath (param "CLAWQL_DIR")))
(deny file-read*
  (subpath (param "HOME_SSH"))
  (subpath (param "HOME_AWS"))
  (subpath (param "HOME_CONFIG")))
```

`clawql sandbox init` also bakes in team `allowedPaths` / `deniedPaths` as literal subpath rules.

### Fail-closed rules

- `sandbox-exec` missing → harness launch aborts
- `clawql sandbox verify` fails → harness launch aborts
- `clawql doctor --smoke` runs verify when sandbox is enabled

When `failClosed: true` (default), the harness aborts rather than proceeding unsandboxed.

### Escalation path

| Level                    | Use when           | Tool                            |
| ------------------------ | ------------------ | ------------------------------- |
| **1 — Seatbelt**         | Daily macOS coding | `clawql sandbox init`           |
| **2 — sandbox_exec MCP** | In-agent snippets  | `CLAWQL_ENABLE_SANDBOX=1`       |
| **3 — Kata**             | Enterprise K8s     | Helm `sandboxKata`              |
| **4 — UTM VM**           | Computer Use       | Share only company repos folder |

MCP-side **`sandbox_exec`:** [Sandbox plugin](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/plugins/sandbox.md) · [Learn: sandbox_exec](https://docs.clawql.com/learn/sandbox-exec). Decision record: [ADR 0008](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0008-fail-closed-local-agent-sandbox.md).

---

## Next steps

- [Quickstart](https://docs.clawql.com/quickstart)
- [For teams — Team vault sync](https://docs.clawql.com/getting-started/for-teams#team-vault-sync)
- [Local provider vault](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/local-provider-vault.md)
- [MCP clients](https://docs.clawql.com/mcp-clients)
- [Memory](https://docs.clawql.com/learn/memory)

© Copyright 2026. All rights reserved. · [ClawQL on GitHub](https://github.com/danielsmithdevelopment/ClawQL)
