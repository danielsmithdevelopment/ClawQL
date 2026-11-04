# Same-host supersede process-evidence audit

Pre-v4 step after the Mac mini authorizing soak (`status=measured_v4_ready` at **`112a8aa6e`**).

## Build chain (do not blur)

| Artifact | Commit / binary | What it proves |
| -------- | --------------- | -------------- |
| Authorizing soak | **`112a8aa6e`** evidence on `soak-mac-mini-authorizing-20261101` | Rates / environment on **pre-enrichment** lab (supersede log = decision only) |
| Dual-sided proof soak / step-3 boards / v4 | **Later enriched lab** (this branch+) | Process evidence: lease stamp **and** local `/proc` observation |

Logging-only enrichment does not change supersede semantics, but evidence must record `celldLabGitCommit` so the chain stays clear.

## What counts as a real pass

Enriched supersede INFO lines include **both** sides:

| Side | Fields |
| ---- | ------ |
| Lease (predecessor) | `lease_pid`, `lease_process_start_ticks`, `lease_boot_id` |
| Local observation | `observed_boot_id`, `boot_id_matches`, `pid_dir_exists`, `observed_process_start_ticks`, `start_ticks_match`, `dead_reason` |

`dead_reason` must be `pid_absent` or `start_ticks_mismatch`, with fields consistent (e.g. `pid_absent` ⇒ `pid_dir_exists=false`).

Auditor status **`pass_process_evidence`** (`ok=true`) only when every supersede line meets that bar.

## Pre-enrichment Mac mini logs — weaker check

Those logs show the **decision** (`dead=<session>` + `expires_in_ms`) not the evidence behind it. An audit of them must report:

| Field | Required value |
| ----- | -------------- |
| `status` | **`count_and_flag_only`** |
| `ok` | **`false`** |

That confirms count (e.g. `--expect 2117`) and that every line is the same-host pre-TTL message. It does **not** prove the predecessor process was gone. Do not relabel it as a pass.

## Auditor

```bash
# Real proof (enriched dual-sided logs):
node scripts/benchmarks/fleet-phased-kill/audit-soak-supersedes.mjs \
  /tmp/fleet-soak-a.log /tmp/fleet-soak-b.log \
  --out docs/benchmarks/program-cell-fleet-kill/supersede-audit-enriched.json

# Pre-enrichment authorizing soak logs only:
node scripts/benchmarks/fleet-phased-kill/audit-soak-supersedes.mjs \
  /tmp/fleet-soak-a.log /tmp/fleet-soak-b.log \
  --expect 2117 \
  --out docs/benchmarks/program-cell-fleet-kill/supersede-audit-mac-mini-count-and-flag.json
# expect status=count_and_flag_only ok=false
```

## Short enriched soak (proof, not authorizing)

A few hundred cycles on the enriched lab is enough — not a `measured_v4_ready` rerun:

```bash
cargo build -p celld --release --manifest-path vendor/celld-lab/Cargo.toml
export CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld
export FLEET_SOAK_CYCLES=200
export FLEET_SOAK_MIN_CYCLES=200
export FLEET_SOAK_HOST_LABEL='enriched-supersede-proof'
export FLEET_SOAK_OUT=$PWD/docs/benchmarks/program-cell-fleet-kill/node-soak-lab-supersede-proof-enriched.json
npm run benchmark:fleet-node-soak
npm run benchmark:fleet-supersede-audit -- \
  /tmp/fleet-soak-a.log /tmp/fleet-soak-b.log \
  --out docs/benchmarks/program-cell-fleet-kill/supersede-audit-enriched.json
```

## Mac mini — pre-enrichment count/flag (copy/paste)

```text
Checkout cursor/supersede-dead-proof-audit-2725 (or newer tip with dual-sided logging).
If /tmp/fleet-soak-a.log and /tmp/fleet-soak-b.log from the authorizing soak still exist:
  npm run benchmark:fleet-supersede-audit -- /tmp/fleet-soak-a.log /tmp/fleet-soak-b.log \
    --expect 2117 \
    --out docs/benchmarks/program-cell-fleet-kill/supersede-audit-mac-mini-count-and-flag.json
Confirm JSON has status=count_and_flag_only and ok=false. Commit that JSON only — do not call it a process-evidence pass.
Meanwhile (independent): rebuild enriched lab; run stale-owner N=40 and wedged N=100; optionally a short enriched soak for pass_process_evidence.
```

## Step 3 (parallel — does not wait on Mac mini count/flag)

On enriched lab binary:

```bash
export CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld
export STREAMS_CELLD_FLEET_REQUIRED=1
# stale-owner N=40 (prior stock used CELLD_TTL_MS=2000)
FLEET_PHASED_N=40 FLEET_PHASED_WEDGE_HEALTH=1 FLEET_PHASED_STALE_OWNER=1 \
  CELLD_TTL_MS=2000 FLEET_PHASED_FENCE_MODE=lab_enriched_stale_owner \
  FLEET_PHASED_EVIDENCE=docs/benchmarks/program-cell-fleet-kill/phased-n40-stale-owner-lab-enriched.json \
  npm run benchmark:fleet-phased-kill

# wedged N=100 (prior stock used CELLD_TTL_MS=3000)
FLEET_PHASED_N=100 FLEET_PHASED_WEDGE_HEALTH=1 \
  CELLD_TTL_MS=3000 FLEET_PHASED_FENCE_MODE=lab_enriched_wedged \
  FLEET_PHASED_EVIDENCE=docs/benchmarks/program-cell-fleet-kill/phased-n100-wedge-lab-enriched.json \
  npm run benchmark:fleet-phased-kill
```

Board logs also emit dual-sided supersede lines — feed them to the auditor for extra step-2 evidence.
