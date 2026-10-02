# Spend governance

**Status:** Spec v0.1 (design — not fully shipped)  
**Package home:** `clawql-core` (hooks / policy load) · `clawql-payments` (caps, counters, signer consumers)  
**Related:** [`LifecycleHook` invariants](../../design/clawql-core-plugin-architecture.md) · [execute batching](../execute/execute-batching-v0.1.md) · [clawql-network (tailcat)](../network/clawql-network-v0.1.md) · [clawql-payments](../../payments/clawql-payments.md)

## Specification v0.1

This document specifies **spend governance**: how money and quota leaving a tenant are checked **before** irreversible work proceeds. Enforcement uses the existing `LifecycleHook` surface (`spend-cap-enforce`). Plugins and overlays may only **restrict** — never loosen.

Inbound rails (Stripe entitlements, inbound x402 gates, virtual-key budgets) already limit what callers may consume _from_ ClawQL. This spec covers **outbound** spend: USDC (or other allowlisted assets) leaving a tenant wallet to pay a third party that spoke `402`.

---

## 1. Purpose

- Reuse `LifecycleHook` — do not invent a payments-only enforcer.
- Fail closed when policy, counters, or signer backends are missing.
- Treat settled USDC as **irreversible**: WORM records mistakes; it does not undo them.
- Match the “documented justification, not less audited” bar already used for [tailcat](../network/clawql-network-v0.1.md#7-enforcement-tailcat-requires-explicit-scope-every-time).

---

## 2. Locked decisions

| Topic                         | Decision                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| **Mechanism**                 | `spend-cap-enforce` hook; action kind includes `outbound_payment`                   |
| **Invariant**                 | Restrict only, never loosen (core-enforced; load-time reject on widening policy)    |
| **Documented justification**  | **Loader-enforced** boolean — not TypeScript-only                                   |
| **First outbound enablement** | **HITL required, no override path** (see § Outbound payment hook)                   |
| **Audit**                     | Extend `ExecuteBatchWORMEntryType` payment fields — no second payments audit schema |

---

## 3. `spend-cap-enforce` (baseline)

Hook shape aligns with [`LifecycleHook`](../../design/clawql-core-plugin-architecture.md):

- **id / name:** `spend-cap-enforce`
- **phase:** `pre-execute`
- **scope:** `model` (and every `execute` inside a payer batch)
- **mode:** blocking
- **default:** deny if policy is missing, unreadable, or required backends are unavailable

Virtual-key / plan `402 insufficient_quota` remains the inbound quota path. Outbound payment uses the same hook family with action kind `outbound_payment`.

---

## Outbound payment hook

**Title:** Outbound payment is a `spend-cap-enforce` hook target  
**Status:** Reuse `LifecycleHook`; do **not** add a payments-only enforcer

### Decision

Grok’s “policy before money moves” (host allowlist, max USDC per call, HITL above threshold, deny if recipient not allowlisted) is `spend-cap-enforce` applied to money leaving the tenant — same interface, same “restrict only, never loosen” invariant locked in `clawql-core`.

### Hook

| Field   | Value                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| name    | `spend-cap-enforce` (existing), action kind `outbound_payment`                                                   |
| phase   | `pre-execute`                                                                                                    |
| scope   | `model` (and every `execute` _inside_ the [payer batch](../execute/execute-batching-v0.1.md#outbound-402-payer)) |
| mode    | blocking                                                                                                         |
| default | deny if policy missing / unreadable / signer backend unavailable                                                 |

### Policy object (narrowing only)

```typescript
type OutboundPaymentPolicy = {
  hostsAllowlist: string[]; // exact host or *.suffix; empty = deny all
  payToAllowlist: string[]; // recipient addresses; quote.payTo must match
  networksAllowlist: string[]; // e.g. eip155:8453
  assetsAllowlist: string[]; // e.g. USDC contract
  maxUsdcPerCall: string; // decimal string
  maxUsdcPerDay: string;
  maxUsdcPerSession: string;
  humanApprovalAboveUsdc: string; // HITL; below this may auto-sign if all other checks pass
  /**
   * Loader-enforced. The policy loader rejects any document that sets this to
   * false, omits it, or ships a non-boolean. TypeScript `true` alone is not
   * sufficient — JSON/config overlays must pass the same check.
   */
  requireDocumentedJustification: true;
  /**
   * Opaque id of the justification artifact (commit message trailer, ticket,
   * or signed note) required when enabling outbound or adding host/payTo.
   * Loader rejects empty when requireDocumentedJustification is in force.
   */
  documentedJustificationId: string;
};
```

A plugin, tenant overlay, or batch script may only **subtract** hosts, **lower** caps, or **raise** the HITL threshold. Anything that widens allowlists or raises caps is **rejected at load time**.

### Loader enforcement (not type-system-only)

At policy load (and on hot-reload):

1. Reject if `requireDocumentedJustification !== true` (strict equality).
2. Reject if `documentedJustificationId` is missing or blank when outbound is enabled or when `hostsAllowlist` / `payToAllowlist` grows relative to the previous accepted policy.
3. Reject any overlay that widens allowlists or raises numeric caps vs the parent policy.
4. Persist the accepted policy version id for WORM `hookPolicyVersion`.

A motivated author bypassing TypeScript still fails the loader. There is no “trusted plugin” escape that skips these checks.

### Checks, in order (all required)

1. Destination host on allowlist.
2. `quote.payTo` on pay-to allowlist (not merely the host).
3. Network + asset on allowlist.
4. Amount ≤ per-call cap.
5. Projected day + session totals ≤ caps (count reserved + settled; fail closed on counter error).
6. If amount ≥ `humanApprovalAboveUsdc`, require HITL approval bound to **quote digest**. Approval of quote A must not authorize quote B.
7. Classification / Panguard / Seatbelt still apply to the inner `execute`. Payment success does not punch a network hole.

On deny or allow, write WORM. Deny never becomes a silent continue.

### First enablement — hard HITL, no override

**Decision (product):** The first enablement of outbound payment on a tenant requires HITL **regardless of amount**. There is **no** emergency bypass, trusted-tenant flag, or operator env that skips this.

Rationale: settled USDC is irreversible in a way almost nothing else in ClawQL is. Matching (and exceeding) the conservatism applied to [tailcat](../network/clawql-network-v0.1.md#7-enforcement-tailcat-requires-explicit-scope-every-time): convenience must not outrank the floor.

Implementation notes:

- Track `outboundPaymentEverEnabled` (or equivalent) in tenant payments state.
- While false, every outbound attempt is `hookDecision: "hitl"` until an approved enablement ceremony completes (justification id + HITL).
- After first enablement, normal amount thresholds apply; re-adding a previously removed host/payTo again requires justification (loader rule above).

### Irreversibility (stricter than tailcat)

Settled USDC cannot be rolled back by a hook, plugin rollback, or quarantine. Therefore:

- Enabling outbound payment or adding a host/payTo requires a documented justification in the policy commit (same “not less audited” rule as `clawql-network` tailcat — see cross-link there).
- First enablement HITL: **no override** (above).
- After `settle_unconfirmed`, freeze that signer for the session until an operator reconciles. Do **not** retry-sign.
- Talon/quarantine may freeze the signer lease; that stops _new_ payments. It does not claw back a completed transfer. The WORM row is the record of the mistake, not an undo.

### WORM

Do not invent a payments audit schema. Extend execute-batch payment fields:

```typescript
type ExecuteBatchPaymentFields = {
  kind: "outbound_payment";
  protocol: "x402" | "mpp";
  resourceUrl: string;
  method: string;
  quoteDigest: string;
  amount: string;
  asset: string;
  network: string;
  payer: string; // address only
  payee: string;
  txHash?: string;
  facilitator: string;
  hookDecision: "allow" | "deny" | "hitl";
  hookPolicyVersion: string;
  tenantId: string;
  agentId: string;
  sessionId: string;
};
```

`EXECUTE_BATCH_COMPLETED` already carries batch id, timing, inner-call count, success/failure. Attach `ExecuteBatchPaymentFields` when the batch is the payer script. Hook denials still emit a completed-batch (or batch-aborted) row so violations are not only in hook logs.

### What this deliberately does not add

- A second spend-enforcement engine
- Managed-hosting P2P as a substitute for outbound 402
- Auto-retry across quote changes
- Any override that disables first-enablement HITL

---

## Concrete implementation slice

1. ~~Policy type + loader checks + `spend-cap-enforce` `outbound_payment` matcher in `clawql-core`.~~ (`packages/clawql-core/src/spend/`)
2. ~~Counters (day/session/reserved) fail closed.~~ (`clawql-payments` `OutboundSpendCounterService`)
3. ~~HITL binding to quote digest; first-enablement gate with no override.~~
4. ~~WORM variant fields + tests (deny-by-default, allowlist miss, cap breach, HITL binding, quote-digest mismatch, `settle_unconfirmed` freeze, loader rejects `requireDocumentedJustification: false`).~~
5. ~~Host wiring of batch runner into execute-batching sandbox~~ (`clawql-core` `ExecuteBatchRegistry` + payments `execute_batch` MCP tool / `outbound-x402-pay` script)
6. ~~One e2e against a public-shape x402 fixture~~ (local HTTP fixture + named-batch WORM; happy + deny)
7. ~~Production EIP-3009 / viem signing behind SecretStore~~ (`signEip3009Payment`; dry-run remains for CI)

## Related

- [Execute batching — Outbound 402 payer](../execute/execute-batching-v0.1.md#outbound-402-payer)
- [clawql-network §7 — tailcat](../network/clawql-network-v0.1.md#7-enforcement-tailcat-requires-explicit-scope-every-time) — parallel irreversibility / justification bar
- [clawql-core plugin architecture §5](../../design/clawql-core-plugin-architecture.md) — restrict-never-loosen
- [clawql-payments](../../payments/clawql-payments.md) — inbound rails; outbound is the gap this hook governs
