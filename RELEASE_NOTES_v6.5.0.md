# ClawQL 6.5.0 — Release notes (draft)

**Target:** Next minor release after **6.4.1**  
**Status:** On `main` — npm tag pending  
**PR:** [#528](https://github.com/danielsmithdevelopment/ClawQL/pull/528) (merged) + docs refresh

---

## Headline

**Smaller default install, bigger opt-in bundle.** Fresh `npx clawql-mcp` now loads a focused **opinionated default stack** instead of implicitly merging every bundled vendor. **AWS top-50**, **Notion**, and a **plugins docs hub** ship alongside init-walkthrough docs modeled on Executor-style onboarding.

---

## Default bundled stack (breaking behavior change)

| Before (≤6.4.x docs implied) | After (6.5.0) |
|------------------------------|---------------|
| No spec env → **`all-providers`** | No spec env → **Cloudflare, GitHub, Slack, Linear, Notion, Onyx** |
| Large cold start, every IDP vendor in index | Faster first run for common SaaS API workflows |

**Restore full merge:**

```bash
CLAWQL_PROVIDER=all-providers npx -p clawql-mcp clawql-mcp
```

**Add cloud manifests to default stack only:**

```bash
CLAWQL_ENABLE_GOOGLE=1 CLAWQL_ENABLE_AWS=1 npx -p clawql-mcp clawql-mcp
```

Helm **`clawql-mcp`** chart may still default to **`all-providers`** for full IDP/Kubernetes stacks — not the same as bare npm first run.

→ [Migration guide](https://docs.clawql.com/resources/migration)

---

## AWS top-50 preset

- Curated **50 AWS service OpenAPI** specs under `providers/aws/`
- **`CLAWQL_PROVIDER=aws`** or **`CLAWQL_ENABLE_AWS=1`** on default stack
- **SigV4** signing on **`execute`**
- Docs: [`docs/providers/aws-onboarding.md`](docs/providers/aws-onboarding.md), [`docs/providers/aws-apis-lookup.md`](docs/providers/aws-apis-lookup.md)

---

## Notion bundled provider

- Official Notion OpenAPI bundled as **`notion`**
- Auth: **`NOTION_API_TOKEN`**, optional **`Notion-Version`**
- Onboarding: [`docs/providers/notion-onboarding.md`](docs/providers/notion-onboarding.md)

---

## Plugins documentation site

- Source: `docs/plugins/*.md`
- Website: [`/plugins`](https://docs.clawql.com/plugins) hub + per-plugin pages
- Registry cross-links updated in [`docs/reference/clawql-plugin-registry.md`](docs/reference/clawql-plugin-registry.md)

---

## Init walkthrough (Phase 1 — docs only)

Executor-inspired onboarding without a new binary yet:

| Asset | Purpose |
|-------|---------|
| [Agent setup prompt](docs/getting-started/agent-setup-prompt.md) | Copy-paste into Cursor/Claude for guided first run |
| [Init walkthrough spec](docs/getting-started/clawql-init-walkthrough-spec.md) | Phased plan: doctor CLI, `clawql init`, future UI |
| [`scripts/dev/clawql-doctor.sh`](scripts/dev/clawql-doctor.sh) | Node/package/HTTP health/auth hints |
| [`/agent-setup`](https://docs.clawql.com/agent-setup) | Website page for the prompt |

---

## HTTP / GraphQL

- **Multi-spec mode:** `/graphql` is **not** mounted on `clawql-mcp-http` (avoids invalid supergraph attach). MCP **`search`** / **`execute`** unchanged.

---

## Upgrade checklist

1. Read [migration](https://docs.clawql.com/resources/migration) if you relied on implicit **`all-providers`** on bare npm.
2. Update **`CLAWQL_*`** env if you need Google/AWS/IDP vendors in local stdio mode.
3. Re-run smoke: **`search`** + read-only **`execute`**.
4. Optional: `bash scripts/dev/clawql-doctor.sh` after HTTP start.

---

## Contributors

See [CHANGELOG.md](CHANGELOG.md) **Unreleased** for full commit-level detail.
