# Same-host supersede process-evidence audit

Pre-v4 step after the Mac mini authorizing soak (`status=measured_v4_ready`).

**Goal:** Confirm every same-host supersede replaced an owner that was **provably dead** via lease `host_process` (`pid` + `process_start_ticks` + `boot_id`).

## What the log means

Lab `node_log.rs` emits:

```text
same-host supersede: fencing predecessor whose host_process is provably dead
```

**only when** `expires_ms > now` **and** `HostProcessIdentity::is_provably_dead_on_this_host` is true. TTL-only fences do **not** use this message.

Post-enrichment lab also logs `pid=`, `process_start_ticks=`, `boot_id=` on that line so an off-host auditor can check the stamped identity was present and well-formed. Pre-enrichment authorizing soak logs (Mac mini) have the message + `expires_in_ms` only — deadness was still checked in-process at fence time, but fields are not on the line.

## Inputs

Mac mini soak writes:

- `/tmp/fleet-soak-a.log`
- `/tmp/fleet-soak-b.log`

Reported supersede count from that run: **2117** (confirm with the auditor `--expect 2117`).

Evidence JSON alone is **not** enough (no per-supersede `host_process`). R2 `nodes/*` only keeps the **live** lease — no version history for predecessors.

## Auditor

```bash
# Field-level (requires enriched logs with pid/ticks/boot_id):
node scripts/benchmarks/fleet-phased-kill/audit-soak-supersedes.mjs \
  /tmp/fleet-soak-a.log /tmp/fleet-soak-b.log \
  --expect 2117 \
  --out docs/benchmarks/program-cell-fleet-kill/supersede-audit-mac-mini.json

# Message-only for pre-enrichment authorizing soak logs:
ALLOW_PRE_ENRICHMENT=1 node scripts/benchmarks/fleet-phased-kill/audit-soak-supersedes.mjs \
  /tmp/fleet-soak-a.log /tmp/fleet-soak-b.log \
  --expect 2117 \
  --out docs/benchmarks/program-cell-fleet-kill/supersede-audit-mac-mini.json
```

Pass statuses:

| `status` | Meaning |
| -------- | ------- |
| `pass_process_evidence` | Every supersede line has pid + ticks + boot_id; all pre-TTL |
| `pass_message_only_pre_enrichment` | All lines are the same-host message / pre-TTL; fields absent (ALLOW_PRE_ENRICHMENT=1) |

## Mac mini local agent prompt (copy/paste)

```text
On the Mac mini (Colima guest where the authorizing soak ran), the soak logs should still be at /tmp/fleet-soak-a.log and /tmp/fleet-soak-b.log (or under the paths used by run-node-soak.mjs).

1. Checkout cursor/supersede-dead-proof-audit-2725 (or pull it).
2. Count: rg -c 'same-host supersede: fencing predecessor whose host_process is provably dead' /tmp/fleet-soak-a.log /tmp/fleet-soak-b.log
3. Run ALLOW_PRE_ENRICHMENT=1 node scripts/benchmarks/fleet-phased-kill/audit-soak-supersedes.mjs /tmp/fleet-soak-a.log /tmp/fleet-soak-b.log --expect 2117 --out docs/benchmarks/program-cell-fleet-kill/supersede-audit-mac-mini.json
4. If --expect fails, re-run without --expect and report the actual total.
5. Commit supersede-audit-mac-mini.json on a branch off this one. Optionally also commit a filtered extract: rg 'same-host supersede' /tmp/fleet-soak-*.log > docs/benchmarks/program-cell-fleet-kill/supersede-lines-mac-mini.log.gz (gzip if large).
6. Do not invent process fields that are not on the log lines. Message-only audit is honest for the pre-enrichment binary that produced measured_v4_ready.
```

## After this audit

Rerun stale-owner N=40 and wedged N=100 on the **lab** binary (step 3), then v4 N=1000 (step 4).
