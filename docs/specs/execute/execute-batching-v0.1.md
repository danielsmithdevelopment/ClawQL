# Execute batching

**Status:** Spec v0.1 (design — not fully shipped)  
**Package home:** `clawql-core` (batch runner) · consumers in `clawql-api` / `clawql-payments`  
**Related:** [`clawql-core` plugin architecture](../../design/clawql-core-plugin-architecture.md) · [spend governance](../spend/spend-governance-v0.1.md) · [clawql-payments](../../payments/clawql-payments.md)

## Specification v0.1

This document specifies **execute batching**: a sandboxed, hook-enforced, WORM-audited script that runs multiple `execute` (or HTTP) steps as one named unit. The model starts (or is given) a batch; only the **terminal** result returns to model context. Intermediate tool dumps, quotes, and signatures stay out of the prompt.

Batching is for mechanical “probe → condition → retry → confirm” loops — status polling, multi-step unlocks, and **outbound 402 payment** (see § Outbound 402 payer). It is not a replacement for ordinary single-shot `execute`.

---

## 1. Purpose

Agents often need a short sequence of `execute` calls where:

- intermediate responses are mechanical (status JSON, 402 terms, facilitator receipts), and
- only the settled outcome belongs in context.

Putting that loop in the model burns tokens and invites forgotten steps. A batch script runs the loop under the same `LifecycleHook` surface, Seatbelt/sandbox limits, and WORM trail as every other `execute`.

---

## 2. Locked decisions

| Topic               | Decision                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| **Runner**          | Sandboxed TypeScript / Effect; same per-inner-call hook enforcement as bare `execute`            |
| **Model surface**   | Named batch id + terminal result only; no streaming of intermediate steps into context           |
| **Hooks**           | Every inner `execute` still fires `pre-execute` / `post-execute`; batching does not bypass hooks |
| **402 payment**     | Implemented as a batch script — **not** special-cased inside bare `execute`                      |
| **Atomic pay tool** | No model-facing `payments_pay_and_fetch`; that shape is the _result_ of the payer batch          |

---

## 3. Batch identity and WORM

```typescript
export type ExecuteBatchWORMEntryType =
  "EXECUTE_BATCH_STARTED" | "EXECUTE_BATCH_COMPLETED" | "EXECUTE_BATCH_ABORTED";

export type ExecuteBatchCompletedFields = {
  batchId: string;
  batchName: string;
  tenantId: string;
  agentId: string;
  sessionId: string;
  innerCallCount: number;
  success: boolean;
  failureReason?: string;
  startedAt: string;
  completedAt: string;
  /** Present when the batch is the outbound payer script (§ Outbound 402 payer). */
  payment?: ExecuteBatchPaymentFields;
};
```

Payment-specific fields live on `EXECUTE_BATCH_COMPLETED` / abort rows — do not invent a separate payments audit schema. See [spend governance — Outbound payment hook](../spend/spend-governance-v0.1.md#outbound-payment-hook).

---

## 4. Idempotency

Bind a batch run to:

`(tenantId, agentId, resourceUrl, method, bodyHash, quoteDigest?)`

- Replays with the same binding must not double-apply irreversible side effects.
- For payment batches, `quoteDigest` is required once a quote exists. A new quote is a **new** batch.

---

## Outbound 402 payer

**Title:** Outbound 402 payer as a batch script  
**Status:** Extension of execute-batching — **not** a new `execute` code path

### Decision

Do **not** put 402-retry inside bare `execute`. A 402 handshake is the same “probe → condition → retry → confirm” loop this primitive exists for. The payer is one more batch script that uses `execute`, hooks, sandbox, and WORM. Special-casing payment inside `execute` would not generalize; a batch script will.

`clawql-payments` today sells, meters, gates (inbound 402), and pays out. The gap is the **client-side payer path**: complete a third-party `402`, settle, return the body, log it. That path is this batch — not P2P, compensation, Stripe Connect, or Ramp.

### What the model sees

The model does **not** call `payments_pay_and_fetch` as an atomic tool. It starts (or is given) a named batch, e.g. `outbound-x402-pay`. Only the terminal result returns to model context:

- **success:** settled response body + payment receipt ids
- **failure:** typed reason (`policy_denied`, `quote_mismatch`, `sign_failed`, `settle_unconfirmed`, `hook_blocked`)

Intermediate quote JSON, facilitator payloads, and signatures **never** enter the prompt.

### Batch script shape

Same sandboxed TypeScript/Effect runner; hooks fire on every inner `execute`:

1. `execute` the resource URL (or MCP tool HTTP transport).
2. If status ≠ 402, return that response. No payment path.
3. Parse `PAYMENT-REQUIRED` / x402 or MPP terms.
4. Fire `pre-execute` hooks on a synthetic payment action (see [spend governance — Outbound payment hook](../spend/spend-governance-v0.1.md#outbound-payment-hook)). **Deny is fatal**; there is no fallback allow.
5. Ask the `SecretStore`-backed signer for a payload for _this_ quote (amount, asset, network, payTo, resource). The model never receives key material.
6. `execute` the same URL again with `X-PAYMENT` / `PAYMENT-SIGNATURE`.
7. Confirm facilitator `/verify` (and settle if the rail requires it).
8. Emit `EXECUTE_BATCH_COMPLETED` with the payment variant.
9. Return only the settled body or the failure type.

**Idempotency:** bind to `(tenantId, agentId, resourceUrl, method, bodyHash, quoteDigest)`. A timeout after sign but before confirm is `settle_unconfirmed`. Do **not** auto-sign a second quote unless the hook allows a bounded retry against the **same** quote digest. A new quote is a new batch.

### Discovery / quote

`payments_discover` and `payments_quote` may exist as operator/debug or batch-internal steps. If exposed to the model at all, they are **read-only** and cannot sign.

### Signer

`X402Signer` is a consumer of `clawql-auth` `SecretStore` — same pluggable backends as the ID-JAG issuer and audit encryption keys (Vault / OpenBao / future Cloudflare Virtual Wallet). Payments must **not** grow a second vault integration.

### Enablement

`CLAWQL_PAYMENTS_OUTBOUND=1` plus existing `CLAWQL_X402_FACILITATOR_URL` / network / asset. Outbound stays **off** unless explicitly enabled. Managed hosting may keep it off until the same compliance bar as compensation/P2P is written down.

### Operator sketch

```bash
export CLAWQL_X402_ENFORCE=1
export CLAWQL_X402_FACILITATOR_URL=https://facilitator.example
export CLAWQL_X402_NETWORK=base
export CLAWQL_PAYMENTS_MCP_TOOLS=1
export CLAWQL_PAYMENTS_OUTBOUND=1
clawql payments x402 wallet setup --address 0x...
clawql payments x402 allowlist add --host api.example.com --max-usdc 0.05
```

Then one e2e against a public x402 fixture with caps set so the happy path and the deny path both produce WORM.

### What this deliberately does not add

- Atomic `payments_pay_and_fetch` as a model-facing tool
- 402-retry inside bare `execute`
- A payments-specific vault
- Auto-retry across quote changes

---

## Concrete implementation slice (payer)

1. ~~Batch script `outbound-x402-pay` with hooks on every inner `execute`.~~ (`runOutboundX402PayBatchEffect` in `clawql-payments`)
2. ~~`X402Signer` as a `SecretStore` service (`clawql-auth` / `clawql-payments`).~~ (dry-run + SecretStore modes)
3. ~~WORM payment fields on `EXECUTE_BATCH_COMPLETED` (see spend governance).~~
4. ~~Tests: deny-by-default, allowlist miss, cap breach, HITL binding, quote-digest mismatch, `settle_unconfirmed` freeze.~~
5. One e2e against a public x402 fixture (follow-on).
6. Wire into sandboxed execute-batching runner when that host lands (follow-on).

## Related

- [Spend governance v0.1](../spend/spend-governance-v0.1.md) — `spend-cap-enforce` / `outbound_payment`
- [clawql-payments](../../payments/clawql-payments.md) — inbound rails vs outbound gap
- [clawql-core plugin architecture](../../design/clawql-core-plugin-architecture.md) — `LifecycleHook`, restrict-never-loosen
- [clawql-network v0.1](../network/clawql-network-v0.1.md) — parallel “documented justification, not less audited” bar (tailcat)
