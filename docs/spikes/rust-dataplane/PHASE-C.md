# Phase C — Verus + boards (ADR 0016)

**Status:** Done (2026-10-23).  
**Branch:** `cursor/rust-dataplane-phase-c-verus-a621`  
**Toolchain:** [`formal/verus/TOOLCHAIN.md`](../../../formal/verus/TOOLCHAIN.md)

## Deliverables

| Item | Result |
| --- | --- |
| Verus on policy evaluator | **Proved** — `formal/verus/approval-policy` (`cargo verus verify` → 11 verified, 0 errors) |
| Label merge / digests | **Stretch deferred** — not proved this slice; stay Lean + differential |
| CF governance cross-diff | **Remeasured** — `diff-governance-cf.sh` zero mismatches |
| Fair governed density board | **Remeasured** — Bun plateau med **128.8 MB** / Rust **15.7 MB** (~**8.2×**); call p999 **5.00** vs **5.30 ms** (tied); 0 errors |
| Multi-attack / approval-integrity | **TS host boards** — not remasured through Rust (dual-process: adversarial surface stays Bun/TS until execute is forwarded) |

## What was proved

Abstract `u64` person ids; exec `evaluate_approval` postconditioned to equal the Lean-shaped spec; theorems:

- no self-approval on Allow
- no duplicate approvers on Allow
- enough approvals on Allow
- destructive + `deny_destructive` ⇒ Deny

String trim / empty-filter remain in TS + `clawql-dataplane` `policy.rs` (unit-tested, not Verus-proved).

## Bars vs go criterion ([BARS.md](./BARS.md))

| Bar | Verdict |
| --- | --- |
| Anon RSS ≤ 65 MB | **Met** (Rust ~14.6 MB) |
| Clearly better p999 | **Not met** — dead heat; ADR already shifts go signal to **density** on this board |
| Zero differential | **Met** |
| Verus policy evaluator | **Met** |

## Go / no-go recommendation

See ADR 0016 **Decision (spike outcome)** — **Accepted (conditional)**: invest in the optional Cloud density dataplane; Bun/TS remains default host; do not claim whole-gateway “mathematically proven policy” until Verus kernels are the sole production evaluators.
