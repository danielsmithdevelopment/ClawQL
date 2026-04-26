# Case study: `docs.clawql.com` Worker limits, MCP `search` / `execute`, and `memory_ingest` (Apr 2026)

This case study documents a **production incident** on the ClawQL documentation site (**`https://docs.clawql.com`**): users saw **case studies fail to load**, Cloudflare returned **Error 1102 (Worker exceeded resource limits)**, and Observability showed **`waitUntil()` task cancellation** warnings. It also records how we used **the same ClawQL MCP tools** we recommend for APIs—**`search`**, **`execute`**, and **`memory_ingest`**—plus **guardrails** (Lighthouse CI, WCAG-oriented fixes, SEO) added afterward so the class of failure is **harder to repeat silently**.

**Website (readable layout):** `/case-studies/docs-clawql-worker-1102-mcp-memory-2026-04` on [docs.clawql.com](https://docs.clawql.com).

---

## 1. Why this case study exists

- **Operators** need a **single narrative** that ties together edge errors, Wrangler auth, MCP debugging, vault memory, and CI prevention—not scattered chat logs.
- **Agents** benefit from **explicit operationIds**, **MCP server identifiers**, and **honest limits** of what REST can prove vs what the dashboard shows.
- **Future you** should not rediscover that **Lighthouse on `next start` ≠ Workers CPU**, or that **Account API tokens** fail certain Wrangler **zone route** steps while still succeeding on **Workers Domains**.

---

## 2. Symptoms and user impact

- **Symptom:** “None of the case studies are loading” on the public docs site; mobile screenshot showed **Cloudflare Error 1102** — **Worker exceeded resource limits**, with a **Ray ID** (example: `9ef9ed27bf83dbdd`, UTC window around **2026-04-21 05:18**).
- **Observability (dashboard):** spike of **errors vs successes** in a one-hour window; repeated **`warn`** lines — **`waitUntil()` tasks did not complete within the allowed time after invocation end and have been cancelled** (see Cloudflare Workers docs on **`context.waitUntil`** lifetime).
- **Interpretation:** the **isolate** was under pressure from **request-time work** (large **MDX / RSC** paths) **and** **post-response** background tasks (often **Next.js + OpenNext** internals, not app-level `waitUntil` calls in `website/src`).

---

## 3. Wrangler auth and deploy path

Chronology (compressed):

1. **Wrangler / OAuth:** browser authorization for `wrangler login` failed (“unexpected error” / network)—common when VPN, extensions, or blocked auth endpoints interfere. **Mitigation:** use **`CLOUDFLARE_API_TOKEN`** + **`CLOUDFLARE_ACCOUNT_ID`** for deploy automation.
2. **Early API auth (9106 on `/memberships`):** resolved by supplying **account context** so Wrangler does not depend on endpoints the token cannot use.
3. **Deploy progressed, then failed on `/zones/.../workers/routes` (10000)** even with broad token permissions: **Account-owned tokens** and **zone route attachment** are a known friction surface. **Mitigation:** remove **`routes`** with **`custom_domain`** from `website/wrangler.jsonc` and attach **`docs.<apex>`** via **`PUT /accounts/{account_id}/workers/domains`** in **`scripts/deploy-docs-to-cloudflare.sh`** (already in repo). **Result:** Worker upload + **custom hostname** succeeded.

---

## 4. Debugging with `search` and `execute` on Cloudflare

After restarting ClawQL MCP in Cursor, the tool descriptor showed the server identifier is **`project-0-ClawQL-clawql`** (not the short name `clawql`).

**`search`** (natural language → ranked **`operationId`**):

- Token verification and zone discovery: hits included **`user-api-tokens-verify-token`**, **`account-api-tokens-verify-token`**, **`zones-get`**.

**`execute`** (representative calls):

| `operationId`                                                                         | Purpose                          | Outcome                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`account-api-tokens-verify-token`**                                                 | Validate **account-owned** token | **200** — token **active** (use **`account_id`** path).                                                                                                   |
| **`user-api-tokens-verify-token`**                                                    | Mis-lead “user” verify           | **401 Invalid API Token** — **expected** for the same secret when it is an **account** token.                                                             |
| **`zones-get`** (`name=clawql.com`, `account.id=…`)                                   | Confirm apex zone                | **200** — zone id matches the id Wrangler used in the failing route call.                                                                                 |
| **`audit-logs-v2-get-account-audit-logs`** (`raw_cf_ray_id`, narrow `since`/`before`) | Correlate **Ray ID**             | **200** with **empty `result`** — edge Worker failures often **do not** appear as account audit rows; **not** a substitute for **Workers Observability**. |
| **`worker-script-settings-get-settings`** (`script_name=clawql-docs`)                 | Logging / observability flags    | **200** — **`observability.enabled`**, **`logs.invocation_logs`**, etc.                                                                                   |
| **`worker-script-search-workers`**                                                    | Confirm Worker exists            | **200** — **`clawql-docs`** present.                                                                                                                      |

**Limitation (called out in session):** **`telemetry.query`** requires a saved **`queryId`** + **`timeframe`** from the **Workers Observability** product; OpenAPI does not ship canned IDs—**dashboard** remains authoritative for per-request traces until a saved query exists.

---

## 5. Observability, `waitUntil` cancellations, and Error 1102

- **1102** and **`waitUntil`** warnings **reinforce** each other: the Worker is doing **too much** per invocation and/or **background** work is **cut off** after the response is returned.
- **Lighthouse in CI** (added after this incident) improves **lab** accessibility/SEO/client metrics on **`next start`** but does **not** measure **Workers isolate CPU**—documented plainly in **`docs/website/website-performance-workers-guardrails.md`**.

---

## 6. `memory_ingest` incident timeline and postmortem

Vault notes (titles / slugs under `Memory/`):

1. **Incident shell** — Ray ID, 1102, hypotheses, log checks (`Memory/incident-docs-clawql-com-error-1102-worker-resource-limits.md`).
2. **API investigation append** — what **`search`/`execute`** proved vs did not (`audit` empty, observability flags).
3. **Dashboard evidence append** — `waitUntil` warning text and chart interpretation.
4. **Guardrails ship** — Lighthouse workflow, assert script, WCAG/SEO/header/sitemap edits (`Memory/clawql-docs-site-performance-wcag-seo-and-lighthouse-ci.md`).

**Why vault, not only Git?** **`memory_recall`** can later thread this incident with **deploy**, **caching**, and **OpenNext** notes via **`wikilinks`** without requiring every reader to open Git blame.

---

## 7. Guardrails: Lighthouse CI, WCAG, SEO, and headers

Shipped in-repo (see **`docs/website/website-performance-workers-guardrails.md`**):

- **GitHub Actions:** `.github/workflows/website-lighthouse.yml` — `npm run build` + `next start` + **Lighthouse** + **`scripts/assert-lighthouse-scores.mjs`** thresholds.
- **WCAG-oriented:** skip link to **`#main-content`**, **`aria-label`** on primary nav blocks, **`focus-visible`** outlines on **`Button`**, default **`loading="lazy"`** / **`decoding="async"`** on MDX **`img`**, **`rel="noopener noreferrer"`** on external **`https://`** links.
- **SEO:** sitemap **`force-static`**, removed misleading **`lastModified: new Date()`** on every URL.
- **Best practices headers:** **`Referrer-Policy`**, **`X-Content-Type-Options`** on `/:path*` via **`website/next.config.mjs`**.

---

## 8. Follow-up issues and prevention checklist

**Suggested GitHub issues (titles only—open and track explicitly):**

- **Scheduled Lighthouse against production** `https://docs.clawql.com/` (looser thresholds; weekly cron).
- **Synthetic uptime** for `/`, `/api/health`, and **one case-study path** (ties to `docs/schedule-synthetic-checks.md`).
- **`eslint-plugin-jsx-a11y`** on `website/` with incremental cleanup.
- **Workers Logpush** or extended retention for **`clawql-docs`** if incidents recur (Ray + path correlation).

**Prevention checklist (condensed):**

- [ ] Watch **Observability** after **large MDX** or **OpenNext/Next** upgrades.
- [ ] Keep **deploy path** documented: `bash scripts/deploy-docs-to-cloudflare.sh`.
- [ ] Treat **CI Lighthouse** as **necessary but insufficient** for **1102**—pair with **dashboard** and **content sizing**.
- [ ] When debugging with MCP, record **`operationId`**, **account id**, and **zone id** in vault notes (**redact tokens**).

---

## 9. References

- **Runbook:** [`docs/website/website-performance-workers-guardrails.md`](../website/website-performance-workers-guardrails.md)
- **Deploy script:** [`scripts/deploy-docs-to-cloudflare.sh`](../../scripts/deploy-docs-to-cloudflare.sh)
- **Lighthouse assert:** [`scripts/assert-lighthouse-scores.mjs`](../../scripts/assert-lighthouse-scores.mjs)
- **Workflow:** [`.github/workflows/website-lighthouse.yml`](../../.github/workflows/website-lighthouse.yml)
- **Prior docs-site case study (build/deploy narrative):** [`cloudflare-docs-site-mcp-workflow.md`](cloudflare-docs-site-mcp-workflow.md)
- **Cloudflare:** Workers **Errors** / **Observability** docs; **`waitUntil`** lifetime.
