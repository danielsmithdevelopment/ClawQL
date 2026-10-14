# PhoneApprove ↔ cloud console parity — v0.1

**Status:** Direction corrected — **full console parity on phone**, not “web-only leftovers.”  
**Surfaces:** `apps/mobile` mirrors managed console nav from `apps/dashboard/src/lib/managed/nav.ts`.  
**Related:** [`docs/design/clawql-mobile.md`](../../design/clawql-mobile.md) · [`mobile-store-iap-v0.1`](../billing/mobile-store-iap-v0.1.md)

## Principle

Operators should be able to do **the same jobs on PhoneApprove** as in the managed cloud console. Depth may ship in phases (fixture → live API), but **no surface is permanently web-only** unless the user says so.

Corrected: earlier agent notes that marked Gateway / Automations / Memory / Audit / Settings / API keys as “intentionally out of scope” are **wrong** for product direction.

## Managed console map → phone

| Console | Phone route (target) | Phase |
| ------- | -------------------- | ----- |
| Home | Tabs Home | Shipped |
| Sessions | `/sessions` (agent timeline) | Next |
| Review | Tabs Review | Shipped |
| Gateway | `/gateway` | Fixture list shipped |
| Automations | `/automations` | Fixture list shipped |
| Skills | Review skill decide + dedicated `/skills` | Partial → next |
| Memory & documents | `/memory` + `/memory/:id` | Explorer shipped |
| Connections & keys | `/keys` (+ connections later) | API keys shipped |
| Audit | `/audit` | Fixture list shipped |
| Team | `/teammates` | Read-only → invite next |
| Usage & billing | `/spend` + Profile plan | Partial |
| Settings | `/settings` | Fixture org/network shipped |
| Profile | Tabs Profile | Shipped |

Phone-native extras (Voice, NFC, App Lock, push inbox) stay additive.

## Safety

- Approve with security key rules unchanged.
- API key **secrets shown once** after create; copy supported.
- Memory erase / ontology / pipelines deepen after explorer.

## Acceptance (this slice)

- [x] Memory explorer list + search + detail fields
- [x] API keys list + create + one-time secret + revoke
- [x] Gateway / Automations / Audit / Settings reachable in-app (fixture)
- [x] Docs no longer say “everything else is web console”
- [ ] Live `/api/managed/*` adapters for memory + keys
- [ ] Sessions timeline + Skills admin queue + Connections accounts
