# Public sites → Astro migration plan

Implements [ADR 0018](../adr/0018-public-sites-astro-console-next.md): **`clawql.com`** and **`docs.clawql.com`** leave Next.js; **`cloud.clawql.com`** / `apps/dashboard` stay Next behind login.

## Goals

- Eliminate Next App Router **RSC flight** (`?_rsc=` / `?rsc=`) as a public attack / quota surface.
- One static-first stack for both public hosts (Astro → Cloudflare Pages / static assets).
- Preserve signup → cloud handoff, SEO, agent markdown / `llms.txt`, and docs content sync scripts.

## Non-goals

- Rewriting `apps/dashboard` (ADR 0012).
- Big-bang same-day cutover of both hosts without preview URLs.
- Changing Stripe / Supabase product contracts — only the HTML shell that calls them.

## Order of work

**Docs first** (operator decision 2026-10-29): largest public page set and primary scraper/`_rsc` burn surface. Marketing (`www`) follows once docs Astro has a preview URL.

| Phase | App | Why |
| ----- | --- | --- |
| **0** | Ops | Keep docs WAF + middleware RSC guard live on **Next** until Astro cutover ([guardrails](./website-performance-workers-guardrails.md)). |
| **1** | `apps/docs-astro` → replaces `apps/docs` | Scaffold + content port; static HTML; drop OpenNext as HTML origin. |
| **2** | `apps/www` | Marketing + signup; same Astro/Pages stack. |
| **3** | Cleanup | Remove OpenNext deploy path, obsolete Worker gzip checks, Next-only CI for public apps. |

## Phase 1 — `apps/docs-astro` (docs.clawql.com)

**In progress:** package at [`apps/docs-astro/`](../../apps/docs-astro/). Production remains [`apps/docs/`](../../apps/docs/) (Next) until DNS cutover.

1. ~~Scaffold Astro (TS + Tailwind v4 + MDX), static `output`, starter layout/nav.~~ (started — `/`, `/quickstart`, `/migration-status`)
2. Bulk-import MDX / generated sync outputs into `src/content/docs/`.
3. Port nav parity, search, plugin registry, security training modules, case studies.
4. Re-home `prebuild` sync scripts to emit into the Astro content tree (same markdown sources under `docs/`).
5. Agent `Accept: text/markdown` + `llms.txt` / `AGENTS.md` parity (Pages Function if needed).
6. Preview on Cloudflare Pages → cut over `docs.clawql.com` → retire `clawql-docs` OpenNext Worker.
7. Keep zone Bot Fight + optional WAF; flight-query rules become belt-and-suspenders.

## Phase 2 — `apps/www` (clawql.com)

1. Scaffold Astro (TS + Tailwind v4) alongside or in-place behind a preview project.
2. Port routes: `/`, `/signup`, `/pricing`, `/about`, industry/GTM landings, benchmarks, legal.
3. Preserve Cloudflare Pages `functions` middleware behavior (Link headers, markdown negotiation) or Astro equivalents.
4. Keep FormSubmit / Supabase Auth / Stripe Checkout CTAs; redirect success into `cloud.clawql.com`.
5. Preview deploy → DNS cutover → delete Next build for www.

## Phase 3 — cleanup

- CI: Lighthouse / Playwright smoke targets Astro preview servers.
- Docs: update deploy scripts (`scripts/deploy/deploy-docs-to-cloudflare.sh`), READMEs, case studies that assume OpenNext.
- Remove `@opennextjs/cloudflare` from docs when unused.
- Optionally rename `apps/docs-astro` → `apps/docs` after Next tree is deleted.

## Success criteria

- [ ] No production HTML for `clawql.com` / `docs.clawql.com` served by Next App Router / OpenNext RSC.
- [ ] Signup still reaches managed console session on `cloud.clawql.com`.
- [ ] Docs SEO (sitemap, canonicals) and agent discovery files still published.
- [ ] Observability: no return of `_rsc`-dominated public traffic cliffs on Free plan.

## Rollback

Keep prior Cloudflare projects / Worker versions attachable for ~1 release. DNS flip back if Astro preview fails SEO or signup handoff checks.
