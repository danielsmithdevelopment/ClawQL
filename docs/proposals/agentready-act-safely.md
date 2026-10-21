# Proposal: AgentReady **act safely** (AR-SAFE)

**Status:** draft for contribution to [agentready-org/standard](https://github.com/agentready-org/standard)  
**Date:** 2026-10-21  
**Authors:** ClawQL (reference implementation + measured boards)  
**Parent spec:** [agentready.org](https://agentready.org) v2.0 — find / read / **act**  
**Why:** Act covers whether an agent _can_ act (auth, API, MCP, payments). It does not yet say what must be true when the action is **consequential**. Businesses fail open on that gap.

This file is the in-repo working text. File an issue (and optionally a PR adding `spec/categories/ar-safe.md`) on the AgentReady standard repo using the issue body at the end.

---

## Gap statement

AgentReady’s act section (AR-ACT-01…10) is correctly scoped to **reachability of action**:

- Auth an agent can finish
- Public API + OpenAPI
- MCP or CLI (MUST when the product should complete tasks)
- WebMCP, payments, NLWeb as SHOULD/MAY

Ora’s scanner numbers that motivate act are about **presence** of those surfaces (~3% MCP, ~1% OAuth metadata + PKCE). They do not measure:

1. Whether a write is previewable before it commits
2. Whether a crash mid-call duplicates a side effect
3. Whether content the agent _read_ can steer tools it _calls_

Those three failure modes are already deciding production trust for agentic products. They belong in the standard as a separate layer — **after** act — so AgentReady does not imply “MCP present ⇒ safe to automate money / infra / PII.”

Proposed strength model (matches AgentReady’s evidence bar):

| Strength   | Meaning here                                                                             |
| ---------- | ---------------------------------------------------------------------------------------- |
| **MUST**   | Without it, consequential automation is unsafe even if AR-ACT passes                     |
| **SHOULD** | Measurably reduces duplicate / injection / unbound-approval failures in published boards |
| **MAY**    | Emerging; enter when studies exist                                                       |

New identifiers use **`AR-SAFE-*`** so they do not collide with AR-ACT. Applicability: **conditional** — products whose agents can mutate state, move money, send messages, or change access. Read-only docs sites remain out of scope (act MAY not apply either).

---

## Proposed practices

### AR-SAFE-01 · SHOULD · Preview before commit for consequential writes

**What it does:** Split “show the agent what would happen” from “perform the side effect.” The preview path must not mutate; the commit path must be an explicit second step (or an approval gate — AR-SAFE-02).

**Best practice:**

- Default dry-run / propose for state-changing tools
- Commit (or park-for-approval) only on an explicit flag or separate tool
- Preview returns the same schema the commit will use (operation id, args, risk class)

**Evidence we can attach (ClawQL):** [sources propose](../specs/risk/sources-propose-v0.1.md) — `dryRun: true` default; commit parks a proposal; approve is **operator-only, not an agent MCP tool**.

**Study ask for Ora / partners:** Instrument agent runs that hit write tools; compare duplicate and regret rates with vs without a mandatory preview turn.

---

### AR-SAFE-02 · MUST (when risk policy says so) · Approval bound to the exact change

**What it does:** A human (or out-of-band policy engine) approves a **digest** of the intended call. Resume / execute must refuse if args diverge.

**Best practice:**

- Canonicalize `{ operation, args, … }` → `argsHash`
- Persist pending intent; approval consumes **that** hash
- Atomic consume before the side effect so concurrent resumes cannot double-fire
- Resume never accepts alternate args

**Evidence (ClawQL):** [execute pause/resume](../specs/risk/execute-pause-resume-v0.1.md) — `argsHash`, atomic consume to `outcome_unknown`, formal model under `formal/tla/mandate/`.

**Why MUST:** Unbound “the agent may retry whatever it wants after I click Approve” is how consequential automation fails in practice. Presence of OAuth (AR-ACT-01) does not bind intent.

---

### AR-SAFE-03 · SHOULD · At-most-once approved writes under crash

**What it does:** If the process dies after approval is consumed but before a clear upstream success, the system must not silently re-send the side effect. Prefer `outcome_unknown` + human/idempotent recovery over “retry until 200.”

**Best practice:**

- Consume approval **before** the remote call
- On uncertainty, mark unknown; do not auto-replay without an idempotency key the upstream honors
- Publish a crash board (N kills across phases) with duplicate rate and unknown rate

**Evidence (ClawQL):** [durability proof STATUS](../benchmarks/durability-proof/STATUS.md) — Tier C: 1,000 phased crashes, **0 repeated writes**, unknowns concentrated in in-flight phases; honesty frame in [golem overlap](../gtm/golem-overlap-and-durability-honesty.md) (execution durability ≠ effect durability).

**Honesty constraint for the standard:** Do not invent “exactly-once remote POST” as MUST. Require **at-most-once for approved writes** and treat exactly-once as conditional on upstream idempotency keys (AR-SAFE-04).

---

### AR-SAFE-04 · SHOULD · Idempotency keys on capable operations

**What it does:** When the upstream API documents an idempotency mechanism, the act surface must pass a stable key derived from the approved intent (e.g. mandate / execution id), not a fresh random key per retry.

**Best practice:**

- Advertise which operations are idempotency-capable in OpenAPI / tool metadata
- Attach key on approved execute / resume
- Document retry_with_key vs human resolution for `outcome_unknown`

**Evidence (ClawQL):** Partial — key derivation `clawql-mandate:<executionId>` and capability hints exist; **do not** claim universal auto-attach on all connectors until measured. Proposal should allow SHOULD with “where the contract supports it.”

---

### AR-SAFE-05 · SHOULD · Untrusted content must not steer tools

**What it does:** Bytes an agent fetches (docs, tickets, email, web) are **data**, not authority to call tools. The act surface should separate retrieval from authorization, and resist prompt/tool injection that elevates read content into write authority.

**Best practice:**

- Capability / ATR style gates on tools independent of retrieved text
- Redaction / extract-then-reason on untrusted corpora where applicable
- Publish an injection evaluation (suite + methodology), not only a blog claim

**Evidence (ClawQL):** In-house [multi-attack injection](../benchmarks/security-suite/multi-attack-injection/) harness and OpenBench memory-injection work — **not yet a published category claim**; **no AgentDojo citation in-tree**. The standard entry should demand **reproducible boards**, and ClawQL should only attach numbers once published.

**Study ask:** Shared injection tasks across MCP hosts; measure tool-call diversion rate when malicious content is in the read set.

---

### AR-SAFE-06 · MAY · Durable audit of act decisions

WORM / append-only decision log for propose, approve, consume, finalize. Supports forensics; not a substitute for AR-SAFE-02/03. Enter as MAY until cross-vendor evidence exists.

---

## Suggested category blurb (for agentready.org)

> **Act safely** — when agents should change something that matters  
> Applies after _act_. Preview consequential writes; bind human approval to an exact digest; prefer at-most-once under crash; pass idempotency keys when the API supports them; keep untrusted content from steering tools. MUST/SHOULD only where measured boards show agents fail without them.

---

## What this is not

- Not a replacement for AR-ACT (you still need MCP/CLI/auth)
- Not a vendor scorecard or badge
- Not “ClawQL-only” — requirements are behavioral; any product can implement
- Not claiming AgentDojo or universal exactly-once

---

## Reference implementation pointer

ClawQL documents and boards above are offered as **one** reference path, same spirit as AR-PROV’s reference implementation note on [agentready-org/standard#2](https://github.com/agentready-org/standard/pull/2). Editors may accept the category text without endorsing the product.

---

## GitHub issue body (paste into agentready-org/standard)

```markdown
## Title

Proposal: AR-SAFE — “act safely” (preview/commit, digest-bound approval, at-most-once writes, injection)

## Summary

AgentReady **act** (AR-ACT-*) correctly covers whether an agent _can_ act. It does not yet cover what must hold when the action is consequential. We propose a conditional category **AR-SAFE** with draft identifiers AR-SAFE-01…06, strength assignments, and an evidence bar matching the rest of the spec (studies / reproducible boards before MUST).

## Motivation

Ora’s act gap numbers (~3% MCP, ~1% OAuth+PKCE) explain _reachability_. Production failures we and others see after MCP exists are different:

1. Writes that commit without a preview
2. Approvals that do not bind to exact args (agent retries something else)
3. Crashes that duplicate side effects
4. Retrieved content that steers tool calls (injection)

Businesses need the standard to name these so “AgentReady act” is not mistaken for “safe to automate wire transfers.”

## Draft requirements

Full text: (link to ClawQL `docs/proposals/agentready-act-safely.md` or inline PR adding `spec/categories/ar-safe.md`)

- AR-SAFE-01 SHOULD Preview before commit
- AR-SAFE-02 MUST (risk-gated) Approval bound to args digest
- AR-SAFE-03 SHOULD At-most-once approved writes under crash
- AR-SAFE-04 SHOULD Idempotency keys where upstream supports them
- AR-SAFE-05 SHOULD Untrusted content must not steer tools
- AR-SAFE-06 MAY Durable audit of act decisions

## Evidence we can contribute

- Digest-bound mandate park/resume + formal notes
- Durability / kill-mid-write boards (at-most-once, outcome_unknown)
- Injection suite methodology (publish-gated; no AgentDojo claim)

Happy to split: category prose first, then schemas, then study design with Ora.

## Non-goals

No badges/weights in the spec. No requirement that every docs site implement AR-SAFE. No “exactly-once remote POST” as MUST.
```

---

## Next steps for ClawQL

1. Open the issue above on `agentready-org/standard` (human or bot with write access).
2. Land P0 public MCP URL honesty from the [score note](../gtm/agentready-score-2026-10.md) so act claims stay credible while proposing act safely.
3. Publish injection board numbers before citing AR-SAFE-05 externally.
4. Optionally PR `spec/categories/ar-safe.md` once editors confirm category layout (repo currently holds `spec/` + prior AR-PROV-style contributions).
