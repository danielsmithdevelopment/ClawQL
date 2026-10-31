# Upstream offer — denoland/celld

**Base checked:** [denoland/celld](https://github.com/denoland/celld) `v0.6.3` (wedged board in flight) and vendored `v0.4.0` → ClawQL `0.4.0-clawql.3`  
**License:** Apache-2.0 (same as upstream)  
**Submission path:** upstream **disables pull requests**. Send a short bug report first, then optional small `git format-patch` attachments, to **ry@deno.com**. Emailing a patch assigns rights in it to Deno Land under their contribution terms. Keep the report private until they respond.

Draft: [`upstream-report/BUG_REPORT_DRAFT.md`](upstream-report/BUG_REPORT_DRAFT.md)

## Why

ClawQL’s Tier C fleet kill board (R2 settle) observed mid-flight kills where an outbound call left without a survivor-readable write intent. Framing per celld’s own docs: silent DO compatibility gaps are defects; output-gate hold-until-durable is not listed among known gaps; alpha gaps are expected.

Two failure modes fit the pre-fence data:

1. **H1 — unfenced ack:** the output gate released after a local/WAL position advance (or a PUT that survivors could not restore).
2. **H2 — stale incarnation:** a wedged node completed PUT/GET (and sometimes fleet ship) after ownership moved.

**Check tip before filing:** re-run the wedged `during_call` board on stock **v0.6.3** (always-on gate). If tip already holds, say so and only offer optional hardening; if it still loses, the report is stronger.

## Proposed patches (minimal, separate)

Offer as **separate** format-patches (not one large agent PR):

1. **Output gate VerifyOwnership for Fleet proofs too:** a wedged member is not sealed; fleet arbitration alone does not close the stale-writer path (`crates/logic/output_gate.rs`).
2. **Epoch-current at confirm:** before advancing `synced_seq` / returning from `await_durable`, re-read `cells/<cell>/own.json` and require it still name this node at the resident epoch.
3. **Fenced bucket ack** (optional / measurement-dependent): after each LTX object PUT, confirm the object is readable before advancing `synced_seq`.
4. **Refuse live incarnation steal** when a foreign live process generation still holds `CELLD_NODE` (default on).
5. **Refuse node-log bundle PUT** when the shipper’s epoch is not Open.

Optional (chaos only, can stay ClawQL-side): `CELLD_WEDGE_HEALTH_FLAG` to hang readiness while a flag file exists.

Also offered for availability (separate from H1/H2):

6. **Alive vs ready:** `GET /.well-known/celld/alive` always returns quickly; readiness `/.well-known/celld/health` times out the actor Health RPC (`CELLD_HEALTH_TIMEOUT_MS`) and returns 503 instead of hanging.
7. **Bounded maintenance:** abort stuck maintain / dead-leader sweep / bundle GC after `CELLD_MAINTENANCE_PHASE_BUDGET_SECS` (default 180).

## Open measurement question

The confirm GET adds ~median half-second on R2 boards. Prefer whichever of PUT-only vs PUT+GET holds under the same kill board once measured.

## Contact

Human maintainer email to ry@deno.com (see draft). If upstream lands equivalent fencing, ClawQL will unpin the fork and return to stock `celld.dev` install.
