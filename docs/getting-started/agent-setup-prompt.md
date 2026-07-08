# Set up ClawQL with your agent

Copy the block below into **Cursor**, **Claude Desktop**, or **Claude Code** to run an end-to-end first-time setup: install, MCP wiring, one vendor credential, and a smoke `search` + `execute`.

**Website:** [docs.clawql.com/agent-setup](https://docs.clawql.com/agent-setup)

---

## Copy-paste prompt

```
You are helping me set up ClawQL (MCP server for API search + execute over OpenAPI/Discovery specs).

Goals:
1. Choose deployment: (A) local stdio via npx, (B) local HTTP via clawql-mcp-http, or (C) Kubernetes Helm full stack — ask me which I prefer if unclear.
2. Install/run ClawQL without pushing secrets to git.
3. Configure my MCP client (Cursor or Claude) and remind me to restart the client after MCP config changes.
4. Pick ONE vendor from the default stack to validate: Cloudflare, GitHub, Slack, Linear, Notion, or Onyx — based on which API token I already have.
5. Run a smoke test: tools/list (if available), search for one operation, then execute a read-only call.

Important facts:
- Default install (no CLAWQL_* spec env): opinionated stack = Cloudflare, GitHub, Slack, Linear, Notion, Onyx — NOT all-providers.
- Full framework bundle: CLAWQL_PROVIDER=all-providers (every bundled vendor + Google top-50 + AWS top-50).
- Add Google/AWS to default stack only: CLAWQL_ENABLE_GOOGLE=1 / CLAWQL_ENABLE_AWS=1.
- Core MCP tools: search, execute, audit, cache. Optional: memory_*, ingest_external_knowledge, etc. via CLAWQL_ENABLE_*.
- Docs: https://docs.clawql.com/quickstart https://docs.clawql.com/mcp-clients https://docs.clawql.com/spec-configuration
- After HTTP start, run: bash scripts/dev/clawql-doctor.sh (or curl /healthz).

Stdio example (default stack):
  npx -p clawql-mcp clawql-mcp

HTTP example:
  PORT=8080 npx -p clawql-mcp clawql-mcp-http
  curl -s http://localhost:8080/healthz

Cursor MCP config (stdio) — adjust path/command as needed:
{
  "mcpServers": {
    "clawql": {
      "command": "npx",
      "args": ["-p", "clawql-mcp", "clawql-mcp"]
    }
  }
}

Do not invent API responses. If execute fails on auth, tell me exactly which env var to set (e.g. GITHUB_TOKEN, SLACK_BOT_TOKEN, LINEAR_API_KEY, NOTION_API_TOKEN, ONYX_API_TOKEN, CLOUDFLARE_API_TOKEN) and link to the matching onboarding doc under docs/providers/.

When done, summarize: deployment mode, loaded spec mode, MCP transport, vendor tested, and next optional steps (vault memory, all-providers, Helm IDP stack).
```

---

## When to use this

- First-time install on a new machine
- Onboarding a teammate who already uses Cursor/Claude
- Validating a fork or release candidate before tagging

## Manual alternative

Follow [Getting started](../readme/getting-started.md) step by step without an agent.
