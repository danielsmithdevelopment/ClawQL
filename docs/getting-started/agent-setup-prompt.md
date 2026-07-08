# Set up ClawQL with your agent

Copy the block below into **Cursor**, **Claude Desktop**, or **Claude Code** for vault-first onboarding: memory home, provider secrets, MCP wiring, and a smoke `search` + `execute`.

**Website:** [docs.clawql.com/agent-setup](https://docs.clawql.com/agent-setup)

---

## Recommended CLI flow (before the prompt)

```bash
npx -p clawql-mcp clawql init --interactive   # ~/.ClawQL + vault/providers.json
npx -p clawql-mcp clawql doctor
npx -p clawql-mcp clawql mcp-config           # paste into Cursor MCP settings
```

Provider tokens live in **`~/.ClawQL/vault/providers.json`** (same KV shape as HashiCorp **`secret/clawql/providers`**). Memory tools use **`~/.ClawQL/Memory/`** via **`CLAWQL_OBSIDIAN_VAULT_PATH`**.

---

## Copy-paste prompt

```
You are helping me set up ClawQL (MCP server for API search + execute over OpenAPI/Discovery specs).

Goals:
1. Run vault-first onboarding:
   npx -p clawql-mcp clawql init --interactive
   npx -p clawql-mcp clawql doctor
   npx -p clawql-mcp clawql mcp-config
2. Choose deployment if not using stdio: (A) local stdio (default), (B) local HTTP clawql-mcp-http, or (C) Kubernetes Helm — ask if unclear.
3. Never put API tokens in mcp.json or git. Secrets go in ~/.ClawQL/vault/providers.json (local) or HashiCorp Vault secret/clawql/providers (K8s). Use clawql init --from-env .env to import, then remove secrets from repo .env.
4. Configure Cursor/Claude with mcp-config output; remind me to restart the MCP client.
5. Pick ONE default-stack vendor to smoke-test with search + read-only execute (GitHub, Slack, Linear, Notion, Onyx, or Cloudflare).
6. Confirm memory_ingest works: CLAWQL_OBSIDIAN_VAULT_PATH should be ~/.ClawQL after init.

Important facts:
- Default install: opinionated stack = Cloudflare, GitHub, Slack, Linear, Notion, Onyx.
- Full bundle: CLAWQL_PROVIDER=all-providers.
- MCP loads ~/.ClawQL/clawql.env + vault/providers.json at startup (no secrets in MCP JSON).
- K8s: make local-k8s-up then clawql init --push-vault with VAULT_TOKEN set.
- Docs: https://docs.clawql.com/agent-setup https://docs.clawql.com/quickstart

Do not invent API responses. On auth failure, point to vault/providers.json or docs/providers/*-onboarding.md.

When done, summarize: home path, secrets vault path, MCP transport, vendor tested, memory vault status.
```

---

## When to use this

- First-time install on a new machine
- Onboarding a teammate who already uses Cursor/Claude
- Validating a release candidate

## Manual alternative

- [Getting started](../readme/getting-started.md)
- [Local provider vault](./local-provider-vault.md)
