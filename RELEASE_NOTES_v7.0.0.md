# ClawQL 7.0.0 — Release notes (draft)

**Target:** Next major release after **6.4.1**  
**Status:** On `main` — npm tag pending  
**PRs:** [#528](https://github.com/danielsmithdevelopment/ClawQL/pull/528) (default stack) + onboarding Tier 1 CLI

---

## Headline

**Smaller default install, vault-first onboarding.** Fresh `npx clawql-mcp` loads a focused **opinionated default stack** instead of implicitly merging every bundled vendor. The **`clawql`** CLI scaffolds **`~/.ClawQL`**, hides token input, writes MCP config, and runs MCP smoke tests — without putting secrets in `mcp.json`.

---

## Default bundled stack (breaking behavior change)

| Before (≤6.4.x docs implied)                | After (7.0.0)                                                     |
| ------------------------------------------- | ----------------------------------------------------------------- |
| No spec env → **`all-providers`**           | No spec env → **Cloudflare, GitHub, Slack, Linear, Notion, Onyx** |
| Large cold start, every IDP vendor in index | Faster first run for common SaaS API workflows                    |

**Restore full merge:**

```bash
CLAWQL_PROVIDER=all-providers npx -p clawql-mcp clawql-mcp
```

Helm **`clawql-mcp`** chart may still default to **`all-providers`** for full IDP/Kubernetes stacks — not the same as bare npm first run.

→ [Migration guide](https://docs.clawql.com/resources/migration)

---

## Onboarding CLI (Tier 1 + Tier 2)

| Command                               | Purpose                                                             |
| ------------------------------------- | ------------------------------------------------------------------- |
| `clawql onboard --interactive`        | **Tier 2** — init + MCP config write + doctor smoke in one flow     |
| `clawql init --interactive`           | Scaffold `~/.ClawQL`, hidden token prompts → `vault/providers.json` |
| `clawql secrets list` / `secrets set` | Manage provider keys without editing JSON by hand                   |
| `clawql doctor --smoke`               | MCP `tools/list` + `search` (+ optional `execute`)                  |
| `clawql mcp-config --write cursor`    | Merge MCP JSON into Cursor / Claude Desktop (with `.bak` backup)    |

MCP startup logs a one-line stderr summary: spec mode, vendor count, memory vault path, configured secret count.

Docs: [Agent setup](docs/getting-started/agent-setup-prompt.md), [local provider vault](docs/getting-started/local-provider-vault.md), [/agent-setup](https://docs.clawql.com/agent-setup)

---

## AWS top-50, Notion, plugins hub

- **AWS:** curated top-50 OpenAPI presets, SigV4 on `execute`
- **Notion:** bundled `notion` provider
- **Plugins:** docs hub at [/plugins](https://docs.clawql.com/plugins) (MCP plugins are opt-in; bundled providers are spec merge only)

---

## Upgrade checklist

1. Read [migration](https://docs.clawql.com/resources/migration) if you relied on implicit **`all-providers`** on bare npm.
2. Run `npx -p clawql-mcp clawql onboard --interactive` (or `clawql init --interactive` + `mcp-config --write cursor`).
3. Verify: `clawql doctor --smoke`.
4. Update **`CLAWQL_*`** env if you need Google/AWS/IDP vendors in local stdio mode.

---

## Contributors

See [CHANGELOG.md](CHANGELOG.md) **Unreleased** for full commit-level detail.
