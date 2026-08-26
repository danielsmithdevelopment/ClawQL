# ClawQL 8.0.0 — release announcement drafts (Medium, LinkedIn, HN/Reddit, X)

**Status:** Draft — publish after the live [GitHub release](https://github.com/danielsmithdevelopment/ClawQL/releases) tag `v8.0.0` and npm confirmation for **`clawql-mcp@8.0.0`**.

**Positioning (use everywhere):** ClawQL provides the **Agentic Gateway** as the **Foundational Platform for Auditable Production AI**.

**Links:** [GitHub release v8.0.0](https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v8.0.0) · [npm: clawql-mcp@8.0.0](https://www.npmjs.com/package/clawql-mcp) · [Docs](https://docs.clawql.com) · [Bundled providers](https://docs.clawql.com/plugins/bundled-providers) · [CHANGELOG](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md) · [RELEASE_NOTES_v8.0.0.md](../../RELEASE_NOTES_v8.0.0.md)

**Note:** 7.2.0 announcement drafts remain at [`announcement-drafts-v7.2.0.md`](announcement-drafts-v7.2.0.md); **8.0** is the opt-in catalog **major**.

---

## 1) Medium / long blog post (draft)

**Title:** _ClawQL 8.0.0: Available ≠ loaded_

**Subhead:** A **semver-major** that makes the bundled API catalog **opt-in by default**, finishes the Managed Edge Gateway wave, and ships web/data/MCP UI + credits hardening on the Agentic Gateway.

**Body:**

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.**

**7.2** closed Memory Stack + IDP Partials. **8.0** is the honesty release for install posture: the OpenAPI catalog stays **in the image**, but nothing is auto-merged until you say so.

1. **Empty by default** — restore 7.x with `CLAWQL_PROVIDER=default` or Helm `providers.pack: default`.
2. **Instance-first plugins** — `CLAWQL_INSTANCE_SPEC` / `CLAWQL_TIER` drive composition; bare `CLAWQL_ENABLE_*` without instance JSON no longer wins.
3. **Gateway fabric** — dedicated VG boot, edge Phase 2 IDP proxy, hardened `managedGateway`.
4. **Web + data + MCP UI** — `clawql-web`, DuckDB `data_*`, HTMX playground.
5. **Credits / Effect** — hosted compliance (P2P off by default), HATEOAS auth gate, Effect-primary auth/payments.

### Why it matters

Regulated and air-gapped installs should not wake up with Cloudflare/GitHub/Slack already in the merge. Greenfield demos still get a one-liner. Pin **`@8`** when you move images and Helm `appVersion`.

**CTA:** `npm install clawql-mcp@8.0.0` · migration in [RELEASE_NOTES_v8.0.0.md](../../RELEASE_NOTES_v8.0.0.md) · [CHANGELOG 8.0.0](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)

---

## 2) LinkedIn (draft)

**Post:**

Shipped **clawql-mcp 8.0.0** (semver-**major**).

Headline: **bundled providers are available but not loaded by default** — restore with `CLAWQL_PROVIDER=default`. Also: Managed Edge Gateway, `clawql-web` / `clawql-data`, MCP UI, credits/Effect hardening.

Pin `@8` · notes: RELEASE_NOTES_v8.0.0.md · npm: clawql-mcp@8.0.0

#MCP #AgenticAI #SemVer #DevTools

---

## 3) Hacker News / Reddit (draft)

**Title:** ClawQL 8.0.0 – Agentic Gateway major: empty-by-default API catalog + Managed Edge Gateway

**Text:**

We open-source an Agentic Gateway (MCP search/execute over OpenAPI + vault memory). 8.0 is a deliberate semver-major: the bundled OpenAPI catalog is no longer auto-loaded on zero-config install (7.x loaded Cloudflare/GitHub/Slack/Linear/Notion/Onyx). One-liner restore: `CLAWQL_PROVIDER=default`.

Also in the box: Managed Edge Gateway hardening, clawql-web / clawql-data, MCP UI, credits compliance defaults, OpenBench B-7.

npm: `clawql-mcp@8.0.0`  
Notes: https://github.com/danielsmithdevelopment/ClawQL/blob/main/RELEASE_NOTES_v8.0.0.md

Happy to answer questions about the opt-in default vs the old opinionated stack.

---

## 4) X / short (draft)

**ClawQL 8.0.0** — semver-major: bundled APIs available ≠ loaded. Restore 7.x with `CLAWQL_PROVIDER=default`. Also Managed Edge Gateway + web/data/MCP UI.

`npm i clawql-mcp@8.0.0`
