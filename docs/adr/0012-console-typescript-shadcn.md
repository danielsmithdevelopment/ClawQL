# ADR 0012: TypeScript + shadcn for every product console

- Status: Accepted
- Date: 2026-10-04
- Related: [`apps/dashboard/`](../../apps/dashboard/), [`apps/www/`](../../apps/www/), [customer dashboard scope](../specs/billing/customer-dashboard-full-scope-v0.1.md), [dashboard shadcn chat](../design/dashboard-shadcn-chat-integration.md)

## Context

ClawQL already ships two front ends:

| Surface | App | Kit today |
| --- | --- | --- |
| Marketing (`clawql.com`) | `apps/www` | Tailwind Plus Oatmeal + `@tailwindplus/elements` |
| Product console (self-host, Desktop, Helm) | `apps/dashboard` | TypeScript + Tailwind v4 + **shadcn/ui** (Base UI, MIT) |

Managed hosting will live at **`cloud.clawql.com`**: org, API keys, billing, usage, audit, events, approvals — the same screens operators already need on the self-hosted dashboard. Tailwind Plus also offers **Catalyst** (copy-in React app kit). Using Catalyst for managed and shadcn for self-host would split the console in two.

## Decision

1. **Marketing stays Tailwind Plus.** `apps/www` (and `apps/docs` kit pages) keep Oatmeal / Plus Elements. That site is not redistributed as the Apache/MIT product.
2. **Every product console is TypeScript + shadcn.** That includes:
   - Self-hosted `apps/dashboard` (local, Desktop, Helm)
   - Managed **`cloud.clawql.com`** (same app, `CLAWQL_CONSOLE_SURFACE=managed`, Supabase session after signup)
3. **Do not adopt Catalyst** for ClawQL consoles. Do not run shadcn and Catalyst long-term.
4. **Build one console, two modes** — not two apps and not two kits. Mode switches auth and backends (vault/k8s vs Supabase), not the component library.
5. **Brand consistency is tokens, not a second kit.** Theme shadcn CSS variables from the Oatmeal palette (mist, type, radius). Do not copy Catalyst components into the public repo.

## Why not Catalyst for managed

- **License.** Catalyst is Tailwind Plus. shadcn/ui is MIT. The dashboard ships in the public Apache/MIT repo; customers fork and modify it. Plus components in that tree recreate the open-source distribution question the marketing site already isolates behind `apps/www/LICENSE.md`.
- **One console.** Managed and self-hosted need the same governance UI (tables, timelines, WORM, spend). Two kits doubles the work and guarantees drift.
- **Data-heavy UI + agents.** TanStack tables, charts, command palette, and the shadcn registry are what this console and Cursor already use.

## Consequences

- `cloud.clawql.com` is a **deployment of `apps/dashboard`**, not a new Catalyst app under `apps/www`.
- Signup on `clawql.com` (`apps/www`) remains Plus; post-signup session lands on the shadcn console.
- `packages/clawql-payments` dashboard **data** (topology, credits HATEOAS) feeds the Next console; it is not a second visual kit.
- Follow-on: align `apps/dashboard/src/styles/tailwind.css` variables with Oatmeal mist tokens; wire managed auth (Supabase) behind `CLAWQL_CONSOLE_SURFACE=managed`.

## Alternatives considered

- **Catalyst for managed, shadcn for self-host** — rejected; two consoles.
- **Catalyst everywhere, including the public dashboard** — rejected; Plus license in the OSS product tree, and the Plus terms call out admin-panel kits as a restricted pattern.
- **New `apps/console` with Catalyst on clawql.com** — rejected; marketing and product stay split by *purpose*, not by a second copy of the same screens.
