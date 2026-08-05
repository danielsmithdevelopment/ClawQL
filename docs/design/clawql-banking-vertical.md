# `clawql-banking` — neobank / BaaS vertical (design)

**Status:** 📋 Design only — not started  
**Date:** 2026-08-05  
**Kind:** Domain vertical plugin (`default`) — same model as planned `clawql-lending`  
**Depends on (compose):** `clawql-payments`, `clawql-documents`, `clawql-memory`, `clawql-automation` (optional: `clawql-ouroboros`)  
**Related:** [Plugin model § verticals](./clawql-plugin-model.md) · [Payments](../payments/clawql-payments.md) · [Credits / ACH](../payments/credits-ach.md) · [Cloudflare Wallets prep](../payments/cloudflare-wallets.md) · Plugin registry

---

## 1. Summary

`clawql-banking` is a **neobank / banking-as-a-service (BaaS) vertical preset** — not a core banking system and not a dumping ground for SWIFT/Plaid into `clawql-payments`.

It composes horizontals ClawQL already ships (payments rails, document IDP, vault memory, automation/HITL) and adds banking-shaped workflows, OpenAPI provider presets, and operator defaults for teams that want agents to operate *inside* a regulated deposit/spend product.

```text
clawql-banking (vertical plugin)
  ├── clawql-payments     money + agentic rails (horizontal — stay thin)
  ├── clawql-documents    KYC packs, statements, disputes (IDP)
  ├── clawql-memory       policy / decision vault (OKF)
  ├── clawql-automation   approvals, HITL, synthetic checks
  └── BaaS / core OpenAPI  via search/execute (Unit-class, ledger, card ISS…)
```

**Peer of `clawql-lending`**, not a replacement for it. Lending = credit decisioning / LOS. Banking = deposit accounts, agent spend authority, KYC lifecycle, dispute/case ops.

---

## 2. Motivation

Neobanks and embedded-finance platforms want:

1. **Agent-native spend** with hard caps (Ramp cards, Cloudflare Virtual Wallets, x402 budgets).
2. **Identity + compliance** trails (KYC/AML packs, decision rationale in the vault).
3. **Document pipelines** for onboarding packets, statements, SAR-adjacent case files — without building a second IDP.
4. **Composable BaaS backends** (ledger, cards, ACH) discovered via ClawQL `search` / `execute`, not hard-coded into the payments package.

`clawql-payments` already answers (1) at the protocol/rail layer. It deliberately does **not** own industry onboarding UX or core-ledger product semantics. The vertical fills that gap the same way Compose stacks do for lending/healthcare today.

---

## 3. Non-goals

| Non-goal | Why |
| -------- | --- |
| Replace Tempo / core banking ledgers | ClawQL orchestrates agents + docs + payments; ledger stays the BaaS/core |
| Fold SWIFT / Fedwire / SEPA into `clawql-payments` | Cross-border rails are partner APIs; expose via OpenAPI sources when a customer needs them |
| Raw Plaid Identity / Assets / Transactions SDK in payments | Payment bank-link is Stripe Financial Connections; non-payment Plaid products are vertical connectors |
| Become a KYC vendor | Integrate Persona / Middesk / Alloy / Jumio (etc.) as providers; ClawQL owns workflow + evidence |
| Duplicate Monetization Gateway | Cloudflare edge x402 is a deploy option; ClawQL already has in-process x402 gates |
| Vertical→vertical imports | Same contributor rule as lending↔legal — compose via Core / shared horizontals only |

---

## 4. KYC: payments package or vertical?

### Decision

**Do not add a full KYC product surface to `clawql-payments`.**

KYC is an **identity + document + case workflow** problem. Payments cares about *whether a funding instrument is usable* and *audit of money movement* — not collecting IDs, running watchlists, or storing biometric evidence.

| Concern | Owning package | Notes |
| ------- | -------------- | ----- |
| ACH / bank **link for top-up** | `clawql-payments` ✅ | Stripe FC + `us_bank_account` (Plaid under Stripe UI) — already shipped |
| Payment WORM / correlation | `clawql-payments` ✅ | Money events only |
| Optional **“payouts locked until KYC cleared”** flag | `clawql-payments` (thin hook) | Boolean / status enum from vertical — **no** document storage in payments |
| ID capture, OCR, classification | `clawql-documents` | Existing IDP pipeline + HITL |
| Watchlist / vendor KYC API calls | OpenAPI providers via `search`/`execute` | Persona, Alloy, Middesk, … |
| Decision record + retention policy | `clawql-memory` (OKF) | `type: decision` + WORM vault events |
| Case orchestration, approvals | `clawql-automation` + **`clawql-banking`** | Vertical presets and `.cqw` workflows |

### What *may* live in payments (thin)

A small, money-adjacent surface is OK later if needed:

```ts
// Conceptual — not shipped
KycGatePort {
  assertPayoutAllowed(subjectId): Effect<void, KycBlocked>
  assertAchTopupAllowed(subjectId): Effect<void, KycBlocked>
}
```

Implemented by the vertical (or a stub that always allows). Payments calls the port before high-impact cash-out / large ACH — it does **not** implement questionnaire UI, vendor webhooks, or document retention.

### Anti-pattern

Putting `kyc_start_session`, document upload, or vendor webhook handlers inside `clawql-payments` would:

- Mix compliance evidence retention with micropayment facilitators.
- Force every payments consumer (inference meters, x402 gates) to pull KYC deps.
- Duplicate IDP capabilities already in `clawql-documents`.

---

## 5. Compose matrix (target)

| Capability | Horizontal | Banking vertical adds |
| ---------- | ---------- | --------------------- |
| Plan entitlements / Stripe | payments | Neobank tier map presets |
| x402 / MPP / AP2 / ACP | payments | Policy templates (which tools require mandates) |
| Ramp + CF Virtual Wallets | payments | Per-customer agent spend playbooks |
| Credits + ACH top-up | payments | Hook: block top-up if KYC incomplete (via port) |
| Agent compensation | payments | SGDOP recruit funded from bank treasury policies |
| Onboarding packet IDP | documents | KYC doc types, Label Studio packs |
| Policy / decision memory | memory | Banking OKF templates, retention tags |
| Approvals / HITL | automation | High-risk transfer / SAR-adjacent queues |
| BaaS ledger / cards / ACH | `search`/`execute` | Bundled OpenAPI source presets + example workflows |

---

## 6. Package layout (proposed)

```text
verticals/clawql-banking/   # or packages/clawql-banking when extracted
  package.json              # name: clawql-banking
  README.md
  src/
    plugin.ts               # Plugin + onRegister (tools are thin)
    kyc-gate-port.ts        # implements payments KycGatePort (optional)
    workflows/              # .cqw presets: onboard, refresh, dispute
    providers/              # example OpenAPI stubs / source ids
  docs/
    operator.md
```

**Dependency rule:** depend on `clawql-core` / `clawql-api` + peer horizontals. **Do not** depend on MCP transport internals. **Do not** import `clawql-lending`.

**Toggle:** `CLAWQL_ENABLE_BANKING=1` or Operator CRD vertical flag (same pattern as other verticals).

---

## 7. Phases

### Phase 0 — Design (this document)

- [x] Vertical vs payments boundary
- [x] KYC ownership decision
- [ ] Tracking issue / RFC (human)

### Phase 1 — Preset vertical (MVP)

1. Package scaffold + enable flag  
2. Compose Memory + Documents + Payments (+ Automation)  
3. KYC IDP sample pack (doc types + HITL config)  
4. Example BaaS OpenAPI source (fixture / dry-run)  
5. Operator docs + Compose profile (`docker/compose/banking.compose.yml`)  
6. Optional `KycGatePort` stub wired into payout / large ACH paths  

### Phase 2 — Design partner

- Live Persona/Alloy (or customer-chosen) connector via providers  
- Cloudflare Virtual Wallet + Ramp playbooks per customer segment  
- SGDOP compensation policies for bank-recruited agents  

### Phase 3 — Hardening

- Retention / residency presets for KYC evidence  
- Helm vertical values  
- Audit queries: money events ↔ KYC decision correlation ids  

**Difficulty:** moderate for Phase 1 (composition + packs). High for Phase 2 only if acting as a regulated KYC platform — prefer partner vendors.

---

## 8. Relationship to other verticals

| Vertical | Overlap | Boundary |
| -------- | ------- | -------- |
| **`clawql-lending`** | Credit docs, underwriting | Lending decides credit; banking holds deposits / spend |
| **`clawql-insurance`** | Claims packets | Different case types; share Documents/HITL patterns |
| **`clawql-blockchain`** | Optional on-chain settlement | Peer optional dep only if RWA/deposit tokenization is in scope |

Prefer **shared document packs** under `deployment/samples/` over cross-vertical imports.

---

## 9. Success criteria

| Metric | Signal |
| ------ | ------ |
| Boundary | No KYC document storage or vendor SDK inside `clawql-payments` |
| Compose | One flag enables banking preset with Memory + Documents + Payments |
| Evidence | KYC decisions recallable via vault; money events remain in payments WORM |
| Generality | Works with at least one external BaaS OpenAPI fixture without core changes |
| Safety | High-impact payouts can refuse when `KycGatePort` says blocked |

---

## 10. Alternatives considered

| Alternative | Rejected because |
| ----------- | ---------------- |
| Grow `clawql-payments` into “banking” | Violates horizontal purity; every inference deploy pulls KYC |
| Wait for `clawql-lending` only | Different buyer (neobank vs LOS); different compose defaults |
| Raw Plaid + SWIFT in Phase 1 | No design partner; Stripe FC covers payment ACH; SWIFT is niche partner API |

---

## 11. Immediate next steps (when prioritized)

1. Open tracking issue linking this design.  
2. Do **not** implement until a neobank / BaaS design partner or strong internal dogfood exists.  
3. Keep Cloudflare Wallets + existing ACH-via-Stripe work on the payments horizontal track.  
4. If a thin payout KYC gate is needed before the full vertical, add only `KycGatePort` + always-allow live layer in payments, with the real implementation landing in this vertical.
