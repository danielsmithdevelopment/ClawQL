# About page draft (`clawql.com/about`)

**Status:** Draft rewrite for marketing site. Prepared 2026-11-11. Live route: [`apps/www/src/app/about/page.tsx`](../../apps/www/src/app/about/page.tsx).

**Related:** [`/governance`](https://clawql.com/governance) · [`/security`](https://clawql.com/security) · [`/audit`](https://clawql.com/audit) · [`/benchmarks`](https://clawql.com/benchmarks) · [`/cloud`](https://clawql.com/cloud) · [`/data-handling`](https://clawql.com/data-handling).

---

# About ClawQL

**Infrastructure that makes AI agents safe to put in front of real systems, and proves it.**

## Why ClawQL exists

(Agents capable enough for production side effects; infrastructure lag; ClawQL as governed gateway with rules agents can't change, tamper-evident trail, crash durability.)

**Audit naming:** MCP `audit` = agent-visible ring buffer (clearable). Tamper-evident trail = `clawql-audit` / `/audit` — agents cannot clear it.

## How we work

Measure before claiming · Publish failures · Correct quickly · Compare fairly · Build in the open (Apache 2.0 packages in this repo; some whitepaper packages private/BSL).

## Founder

Daniel Smith. Sand Dollar / IBM CBDC state-machine bio included as **draft pending clearance**.

## Where we are

| Claim | Verdict (2026-11-11) |
| --- | --- |
| Open-source gateway shipping (npx, Helm, operator) | Yes — `clawql-operator` 0.1.0 scaffold; do not say “v7 operator” |
| Case studies = founder deployments, not customers | Yes — no customer production use yet |
| Managed hosting early access, founder-led | Yes |
| IDP hosted tenants onboarding today | **Not verified — omitted** |
| Pre-revenue; no fake certs/refs | Keep |
| Regional Hub / Dedicated VG / Edge swarm | **Design** — labeled; see `/cloud` |
| See The Greens | **In development** (`clawql-lending` not started in plugin registry) |

## Reconciliation checklist

### Fix now

- [x] `audit` tool vs tamper-evident trail — explicit on /about; marketing.ts help updated; /audit already distinguished
- [x] “Production” / “in use” = founder ops + OSS shipping, not customers
- [x] Drop unverified “IDP hosted tenants are onboarding”

### Fix before Cloud launches

- [x] Topology labeled as design
- [x] Tool list / Onyx moved off /about (tools stay on home/docs)
- [x] Public GTM playbooks removed from /about CTA (still reachable elsewhere if needed)
- [x] See The Greens status: in development

### Structure

- [x] Tool surface + case-study grid removed from /about
- [x] Founder section added
- [x] Version: 8.0 product line; operator without “v7”
- [x] Licensing dual statement

## Notes for publishing

- [ ] Clear Sand Dollar wording before removing the draft banner
- [ ] Expand founder bio beyond Sand Dollar when ready
- [ ] Add verified external use metrics only when available
- [x] Honest no-certs / no-references line retained
