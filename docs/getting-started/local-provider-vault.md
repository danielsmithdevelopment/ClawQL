# Local provider vault (stdio / solo dev)

**Production path:** [Vault provider secrets](../deployment/vault-provider-secrets.md) — HashiCorp KV **`secret/clawql/providers`** → ESO → **`clawql-provider-env`**.

**Local path (default for `npx clawql-mcp`):** the same KV **property names** in a file on disk. MCP loads them at startup — **no secrets in `mcp.json`**.

---

## Layout

After **`clawql init`**:

```text
~/.ClawQL/
  clawql.env                 # CLAWQL_OBSIDIAN_VAULT_PATH, CLAWQL_HOME (no secrets)
  vault/
    providers.json           # mode 0600 — githubToken, slackToken, linearApiKey, …
  Memory/                    # memory_ingest / memory_recall
  Dashboard/chats/           # optional dashboard UI history
```

---

## Commands

```bash
# Scaffold home + memory paths
npx -p clawql-mcp clawql init

# Prompt for default-stack API tokens → providers.json
npx -p clawql-mcp clawql init --interactive

# Import from an existing .env (recognized keys only)
npx -p clawql-mcp clawql init --from-env .env

# Push to HashiCorp Vault when VAULT_TOKEN (+ VAULT_ADDR) is set
npx -p clawql-mcp clawql init --push-vault

# Health: memory vault, provider coverage, HTTP /healthz
npx -p clawql-mcp clawql doctor

# MCP JSON for Cursor (stdio — secrets not included)
npx -p clawql-mcp clawql mcp-config
```

---

## Property catalog

Same as **`scripts/kubernetes/provider-vault-key-catalog.ts`** / dashboard **Provider secrets** UI:

| Vault property | Env injected | Default stack |
|----------------|--------------|---------------|
| `githubToken` | `CLAWQL_GITHUB_TOKEN` | yes |
| `slackToken` | `CLAWQL_SLACK_TOKEN` | yes |
| `linearApiKey` | `LINEAR_API_KEY` | yes |
| `notionApiToken` | `NOTION_API_TOKEN` | yes |
| `onyxApiToken` | `ONYX_API_TOKEN` | yes |
| `cloudflareApiToken` | `CLAWQL_CLOUDFLARE_API_TOKEN` | yes |

Full list: [vault-provider-secrets.md](../deployment/vault-provider-secrets.md).

---

## Load order at MCP startup

1. Package / cwd `.env` (legacy — prefer moving secrets into vault)
2. `~/.ClawQL/clawql.env`
3. `~/.ClawQL/vault/providers.json` → env (does not override already-set keys)
4. If `~/.ClawQL` exists and **`CLAWQL_OBSIDIAN_VAULT_PATH`** unset → default to `~/.ClawQL`

---

## Promote local → cluster

```bash
# After filling ~/.ClawQL/vault/providers.json or .env
VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=… \
  npx -p clawql-mcp clawql init --push-vault

# Or existing import script
IMPORT_MODE=providers npm run import-dotenv-to-vault:http
```

Then **`kubectl rollout restart deployment/clawql-mcp-http -n clawql`**.

---

## Why this beats Executor-style onboarding

- **Persistent agent memory** (`Memory/`) is created in the same init step — not a separate product surface.
- **Secrets vault** matches production HashiCorp shape — no re-keying when you move to Helm.
- **MCP config stays secret-free** — Executor puts API keys in HTTP headers in client config; ClawQL loads from vault server-side.
