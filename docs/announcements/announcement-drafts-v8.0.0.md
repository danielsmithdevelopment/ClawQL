# ClawQL 8.0.0 — release announcement drafts (Medium, LinkedIn, HN/Reddit, X)

**Status:** Draft — publish after the live [GitHub release](https://github.com/danielsmithdevelopment/ClawQL/releases) tag `v8.0.0` and npm confirmation for **`clawql-mcp@8.0.0`**.

**Positioning (use everywhere):** ClawQL provides the **Agentic Gateway** as the **Foundational Platform for Auditable Production AI**.

**Links:** [GitHub release v8.0.0](https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v8.0.0) · [npm: clawql-mcp@8.0.0](https://www.npmjs.com/package/clawql-mcp) · [Docs](https://docs.clawql.com) · [Bundled providers](https://docs.clawql.com/plugins/bundled-providers) · [CHANGELOG](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md) · [RELEASE_NOTES_v8.0.0.md](../../RELEASE_NOTES_v8.0.0.md)

**Note:** 7.2.0 announcement drafts remain at [`announcement-drafts-v7.2.0.md`](announcement-drafts-v7.2.0.md); **8.0** is the opt-in catalog + **ProviderPlugin** **major**.

---

## 1) Medium / long blog post (draft)

**Title:** _ClawQL 8.0.0: Available ≠ loaded_

**Subhead:** A **semver-major** that makes the bundled API catalog **opt-in by default**, hard-breaks to **`ProviderPlugin`**, turns enforcement **opt-in**, and ships skills search, observability, and the Managed Edge Gateway wave.

**Body:**

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.**

**7.2** closed Memory Stack + IDP Partials. **8.0** is the honesty release for install posture **and** extension surface:

1. **Empty by default** — restore 7.x with `CLAWQL_PROVIDER=default` or Helm `providers.pack: default`.
2. **`ProviderPlugin` only** — legacy `Plugin` bridge gone; rewrite out-of-tree plugins ([migrate-to-8.0](../getting-started/migrate-to-8.0.md)).
3. **Enforcement opt-in** — Panguard proxy off until `CLAWQL_PANGUARD_PROXY_PLUGIN=1`; boot warns if none active.
4. **Skills-unified search** — operations and skills in one ranker; Agent Seer cold-start scenarios.
5. **Gateway + web/data/MCP UI** — Managed Edge Gateway, `clawql-web`, DuckDB `data_*`, PixelDrop / HTMX playground.
6. **Observability + audit** — `clawql-observability` LGTM+/Faro; merkle/audit WORM wedge; simulated TEE.
7. **Network + analytics** — `clawql-network` mesh CLI; `clawql-analytics` docs adapter; workspace **`0.1.0`** first-publish policy.
8. **Learn / 8.0 docs** — migrate-to-8 guide, Streams/IDP labs, Security/OSV sidebar.
9. **Credits / Effect** — hosted compliance (P2P off by default), HATEOAS auth gate, Effect-primary auth/payments.

### Why it matters

Regulated and air-gapped installs should not wake up with Cloudflare/GitHub/Slack already in the merge — or with a silent ungated tool surface. Greenfield demos still get a one-liner. Pin **`@8`** when you move images and Helm `appVersion`.

**CTA:** `npm install clawql-mcp@8.0.0` · migration in [RELEASE_NOTES_v8.0.0.md](../../RELEASE_NOTES_v8.0.0.md) · [CHANGELOG 8.0.0](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)

---

## 2) LinkedIn (draft)

**Post:**

Shipped **clawql-mcp 8.0.0** (semver-**major**).

Headlines: **available ≠ loaded** providers · **`ProviderPlugin` hard break** · enforcement **opt-in** · skills-unified search · LGTM+/Faro observability · `clawql-network` + analytics · Learn/migrate-to-8 docs · Managed Edge Gateway.

Pin `@8` · migrate: docs/getting-started/migrate-to-8.0.md · npm: clawql-mcp@8.0.0

#MCP #AgenticAI #SemVer #DevTools

---

## 3) Hacker News / Reddit (draft)

**Title:** ClawQL 8.0.0 – empty-by-default API catalog, ProviderPlugin hard break, enforcement opt-in

**Text:**

We open-source an Agentic Gateway (MCP search/execute over OpenAPI + vault memory). 8.0 is a deliberate semver-major:

1. Bundled OpenAPI catalog no longer auto-loads (restore: `CLAWQL_PROVIDER=default`).
2. Legacy `Plugin` bridge removed — `ProviderPlugin` / `StandaloneSkillPlugin` only.
3. Tool-scope enforcement default off (opt in Panguard proxy; boot warns if none).

Also: skills-unified search, Agent Seer scenarios, Managed Edge Gateway, clawql-web/data, LGTM+/Faro observability, clawql-network/analytics, audit/TEE wedge, Learn docs for 8.0 migration, OpenBench B-7.

npm: `clawql-mcp@8.0.0`  
Notes: https://github.com/danielsmithdevelopment/ClawQL/blob/main/RELEASE_NOTES_v8.0.0.md  
Migrate: https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/migrate-to-8.0.md

Happy to answer questions about the opt-in defaults vs the old opinionated stack.

---

## 4) X / short (draft)

**ClawQL 8.0.0** — semver-major: available ≠ loaded providers · ProviderPlugin hard break · enforcement opt-in · skills search · LGTM+/Faro. Restore catalog: `CLAWQL_PROVIDER=default`.

`npm i clawql-mcp@8.0.0`
