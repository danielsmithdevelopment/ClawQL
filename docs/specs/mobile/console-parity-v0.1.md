# PhoneApprove ↔ cloud console parity — v0.1

**Status:** Direction corrected — **full console parity on phone**, not “web-only leftovers.”  
**Surfaces:** `apps/mobile` mirrors managed console nav from `apps/dashboard/src/lib/managed/nav.ts`.  
**Related:** [`docs/design/clawql-mobile.md`](../../design/clawql-mobile.md) · [`mobile-store-iap-v0.1`](../billing/mobile-store-iap-v0.1.md)

## Principle

Operators should be able to do **the same jobs on PhoneApprove** as in the managed cloud console. Depth may ship in phases (fixture → live API), but **no surface is permanently web-only** unless the user says so.

Corrected: earlier agent notes that marked Gateway / Automations / Memory / Audit / Settings / API keys as “intentionally out of scope” are **wrong** for product direction.

## Managed console map → phone

<<<<<<< HEAD
<<<<<<< HEAD

=======
>>>>>>> 0bab0bc4 (feat(mobile): Gateway routes, Memory erase, billing portal CTA)
| Console            | Phone route (target)            | Phase                                              |
| ------------------ | ------------------------------- | -------------------------------------------------- |
| Home               | Tabs Home                       | Shipped                                            |
| Sessions           | `/sessions`                     | Agent timeline + managed API                       |
| Review             | Tabs Review                     | Shipped                                            |
| Gateway            | `/gateway`                      | Endpoints + model routes; managed API              |
| Automations        | `/automations`                  | Subscriptions; managed API                         |
| Skills             | `/skills` + Review skill decide | Proposed/active + managed API                      |
| Memory & documents | `/memory` + `/memory/:id`       | Explorer + pipelines + erase; managed API          |
| Connections & keys | `/connections` + `/keys`        | Live keys/connections adapters                     |
| Audit              | `/audit`                        | Entries + incident; managed API                    |
| Team               | `/teammates`                    | Invite + roles/groups; `/api/managed/team`         |
| Usage & billing    | `/spend` + Profile plan         | Usage depth + billing portal CTA                   |
| Settings           | `/settings`                     | Org + network + retention; managed API             |
| Profile            | Tabs Profile                    | Shipped                                            |
<<<<<<< HEAD
| =======            |
| Console            | Phone route (target)            | Phase                                              |
| -------            | --------------------            | -----                                              |
| Home               | Tabs Home                       | Shipped                                            |
| Sessions           | `/sessions`                     | Agent timeline shipped                             |
| Review             | Tabs Review                     | Shipped                                            |
| Gateway            | `/gateway`                      | Fixture list shipped                               |
| Automations        | `/automations`                  | Fixture list shipped                               |
| Skills             | `/skills` + Review skill decide | Proposed/active shipped                            |
| Memory & documents | `/memory` + `/memory/:id`       | Explorer shipped                                   |
| Connections & keys | `/connections` + `/keys`        | Connections + keys; live keys/connections adapters |
| Audit              | `/audit`                        | Entries + chain incident shipped                   |
| Team               | `/teammates`                    | Invite + roles/groups; live `/api/managed/team`    |
| Usage & billing    | `/spend` + Profile plan         | Month/forecast/team rows via `/api/managed/usage`  |
| Settings           | `/settings`                     | Org + network + retention shipped                  |
| Profile            | Tabs Profile                    | Shipped                                            |

> > > > > > > 2515bf00 (feat(mobile): Team invite/roles and deeper Usage via managed APIs)
=======
>>>>>>> 0bab0bc4 (feat(mobile): Gateway routes, Memory erase, billing portal CTA)

Phone-native extras (Voice, NFC, App Lock, push inbox) stay additive.

## Safety

- Approve with security key rules unchanged.
- API key **secrets shown once** after create; copy supported.
- Memory erase requires confirmation checkboxes; hashed reference kept.

## Acceptance (this slice)

- [x] Memory explorer list + search + detail fields
- [x] API keys list + create + one-time secret + revoke
- [x] Gateway / Automations / Audit / Settings reachable in-app (fixture)
- [x] Docs no longer say “everything else is web console”
- [x] Sessions timeline + Skills proposed/active + Connections accounts
- [x] Richer Audit (incident) + Settings (network/privacy)
- [x] Live adapters for `/api/managed/keys` + `/api/managed/connections` (fixture fallback)
- [x] Fixture-backed `/api/managed/memory` + `/sessions` + `/skills` + mobile adapters
- [x] Team invite / roles / groups on phone (`/api/managed/team`)
- [x] Deeper Usage from `/api/managed/usage` (month, forecast, team budgets)
- [x] Managed `/api/managed/{gateway,automations,audit,settings}` + mobile adapters
- [x] Memory pipelines list + subject erase (fixture)
- [x] Billing portal CTA from Spend (live Stripe or honesty fallback)
