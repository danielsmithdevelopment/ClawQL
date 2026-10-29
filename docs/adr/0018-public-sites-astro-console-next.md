# ADR 0018: Astro for public sites; Next.js only for the logged-in console

- Status: Accepted
- Date: 2026-10-29
- Related:
  - [ADR 0012](./0012-console-typescript-shadcn.md) (product console kit — unchanged)
  - [`apps/www/`](../../apps/www/) (`clawql.com` marketing + signup)
  - [`apps/docs/`](../../apps/docs/) (`docs.clawql.com`)
  - [`apps/dashboard/`](../../apps/dashboard/) (`cloud.clawql.com` + self-host console)
  - [Public sites Astro migration plan](../website/public-sites-astro-migration.md)
  - [Workers / RSC guardrails](../website/website-performance-workers-guardrails.md)

## Context

Public ClawQL sites (`clawql.com`, `docs.clawql.com`) currently run **Next.js App Router**. Docs additionally deploy via **OpenNext on Cloudflare Workers**. That stack exposes **RSC flight URLs** (`?_rsc=` / `?rsc=`): bots and scrapers replay them without `RSC: 1`, forcing expensive Worker/HTML work. In Oct 2026 this produced a sudden free-plan traffic cliff, Cloudflare edge rate-limits on `docs.clawql.com`, and bill-shock risk if Workers were upgraded without a spend cap.

Meanwhile the product split is already clear:

| Surface                     | Host                           | Job                                                       |
| --------------------------- | ------------------------------ | --------------------------------------------------------- |
| Marketing + signup          | `clawql.com`                   | Waitlist / Supabase / Stripe Checkout → hand off to cloud |
| Documentation               | `docs.clawql.com`              | Mostly static MDX / SEO / agent markdown                  |
| Managed + self-host console | `cloud.clawql.com` / dashboard | Auth’d org, keys, billing, audit — **behind login**       |

Signup and “get started with cloud plans” do **not** require App Router on the public marketing site; they are forms and redirects into the console ([ADR 0012](./0012-console-typescript-shadcn.md)). Docs do not need RSC at all. The console **does** need a rich authenticated SPA/app — and is not a public scrape target in the same way.

## Decision

1. **Migrate both public sites off Next.js to Astro** (static-first, Cloudflare Pages / static assets — not OpenNext Workers as the primary HTML path):
   - `apps/www` → Astro (keep Tailwind Plus / Oatmeal **visual** kit where licensing allows; framework changes, design system intent stays)
   - `apps/docs` → Astro via **`apps/docs-astro`** during migration (content collections / MDX; replace `apps/docs` at cutover; Starlight only if it fits ClawQL nav — do not force a theme that fights the brand). **Docs migrate before www** (largest scrape surface).
2. **`apps/dashboard` stays Next.js + shadcn** for self-host and **`cloud.clawql.com`** ([ADR 0012](./0012-console-typescript-shadcn.md)). Logged-in console traffic is out of scope for this public-bot class of problem.
3. **Do not put the product console on Astro** to “unify frameworks.” Unify **public** sites; keep the **app** on Next.
4. **Until cutover**, keep defense-in-depth on the current docs Worker (`RSC` header guard, zone WAF block for flight queries without `RSC: 1`, Bot Fight Mode). Migration removes the class of bug; WAF remains useful.

## Why Astro (not Hono, not “stay Next”)

- **Hono** is an HTTP toolkit (already used in gateway / overrides). It is not a docs or marketing site generator.
- **Stay Next on public sites** leaves `_rsc` / OpenNext amplification as a permanent ops tax on Cloudflare Free.
- **Astro** ships static HTML by default, islands only where signup/checkout need client JS, and maps cleanly to Cloudflare Pages — same ops shape for `www` and `docs`.

## Consequences

- Public HTML responses should not depend on Next RSC flight protocol.
- Signup remains on `clawql.com`; session after signup lands on `cloud.clawql.com` (dashboard) — unchanged product flow.
- Deploy scripts, CI Lighthouse/a11y, and agent-markdown negotiation move with each app; OpenNext gzip / Worker CPU guardrails become docs-legacy after cutover.
- ADR 0012’s “marketing stays Tailwind Plus” still means **Plus design kit / Oatmeal visuals**, not “marketing stays Next forever.” Framework = Astro per this ADR.

## Alternatives considered

- **Astro for docs only; www stays Next** — rejected; both are public-facing and should share one static-first stack.
- **Astro for everything including dashboard** — rejected; console UX and ADR 0012 shadcn investment stay on Next behind auth.
- **Hono + raw HTML/MDX** — rejected; reinventing routing, content collections, and MDX for two large sites.
- **Paid Workers + rate limits, keep Next** — rejected as primary strategy; paid without a hard spend cap is how bot floods become surprise bills.
