# Upstream offer — denoland/celld

**Base:** [denoland/celld](https://github.com/denoland/celld) `v0.4.0` (see `UPSTREAM_PIN`)  
**ClawQL revision:** `0.4.0-clawql.2` in this vendor tree  
**License:** Apache-2.0 (same as upstream)

## Why

ClawQL’s Tier C fleet kill board (N=1000, R2 settle) observed mid-flight kills where an outbound call left without a survivor-readable write intent. Two failure modes fit the data:

1. **H1 — unfenced ack:** the output gate released after a local/WAL position advance (or a PUT that survivors could not restore).
2. **H2 — stale incarnation:** a wedged node completed PUT/GET (and sometimes fleet ship) after ownership moved; four of five measured losses were in stall cascades.

## Proposed patches (minimal)

Offer these as one or more PRs against denoland/celld:

1. **Fenced bucket ack** (`CELLD_FENCED_ACK`, default on): after each LTX object PUT, confirm the object is readable before advancing `synced_seq`. Disable with `=0`.
2. **Epoch-current at confirm:** before advancing `synced_seq` / returning from `await_durable`, re-read `cells/<cell>/own.json` and require it still name this node at the resident epoch.
3. **Output gate VerifyOwnership for Fleet proofs too:** a wedged member is not sealed; fleet arbitration alone does not close the stale-writer path.
4. **Refuse live incarnation steal** when a foreign live process generation still holds `CELLD_NODE` (default on).
5. **Refuse node-log bundle PUT** when the shipper’s epoch is not Open.

Optional (chaos only, can stay ClawQL-side): `CELLD_WEDGE_HEALTH_FLAG` to hang `/.well-known/celld/health` while a flag file exists.

## Open measurement question for upstream

The confirm GET adds ~median half-second on R2 boards. If S3/R2 PUT success already means durable store, the original bug may have been sequence advance *before* PUT returned — and the GET may be removable once that ordering is proven. We will publish PUT-only vs PUT+GET latency once measured; prefer whichever number holds under the same kill board.

## How to apply

```sh
# From a denoland/celld checkout at v0.4.0:
# Diff the files listed in FORK.md against this vendor tree, or cherry-pick
# the ClawQL commits that touch:
#   crates/celld/ltx_repl.rs
#   crates/logic/output_gate.rs
#   crates/celld/actor.rs / node_log.rs (live incarnation + bundle refuse)
#   crates/celld/main.rs (bind_ownership; optional wedge flag)
#   crates/celld/ownership_store.rs (node_id)
```

## Contact

ClawQL maintainers via the ClawQL repo issue/PR that vendors this tree. If upstream lands equivalent fencing, ClawQL will unpin the fork and return to stock `celld.dev` install.
