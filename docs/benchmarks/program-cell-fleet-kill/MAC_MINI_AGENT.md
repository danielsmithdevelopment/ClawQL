# Mac mini local agent — authorizing fleet soak → v4

**Branch to check out:** `cursor/mac-mini-v4-authorizing-2725`  
**Contains:** expiry≠dead lab celld + BOOTTIME lease mono + harness freezes (effect ledger, missing-data, `during_call` phase-validity).  
**Goal:** Authorizing 1000-cycle soak → `status=measured_v4_ready`, then **v4 N=1000**. Settles the cloud 200-cycle soak’s **3 counted self-fences** (`voided=false` — do not reattribute without a monitor void).

**Context (do not rewrite):**
- Published TTL3s N=100 **2 × `lost_midflight_intent`** stays as-is.
- Side-by-side reclassify: trial 1 = `injection_missed` with `basis: journal_surrogate` / `effect_ledger: unavailable` (**not** a verified settle); trial 5 = `incomplete_no_pause` (**unsettled**).
- See [`WEDGE_TTL3S_CORRECTNESS.md`](./WEDGE_TTL3S_CORRECTNESS.md) · [`TTL3S_THREE_CHECKS.md`](./TTL3S_THREE_CHECKS.md) · [`FROZEN_MISSING_DATA.md`](./FROZEN_MISSING_DATA.md).

This file is the runbook. Paste the **Local agent prompt** block below into your Mac mini agent.

---

## Local agent prompt (copy/paste)

```text
You are on a Mac mini. Checkout branch cursor/mac-mini-v4-authorizing-2725 of danielsmithdevelopment/ClawQL and follow docs/benchmarks/program-cell-fleet-kill/MAC_MINI_AGENT.md exactly.

Mission: (1) authorize pre-v4 fleet readiness — lab celld node soak to status=measured_v4_ready; (2) if soak passes, run v4 N=1000 wedged TTL=3000 with append logs + R2 intent check + frozen missing-data/phase-validity gates; (3) always report TTL3s published 2/100 kept, trial1 journal_surrogate (not verified), trial5 unsettled.

Hard constraints (do not renegotiate):
1. Use the lab binary built from vendor/celld-lab on THIS branch (expiry≠dead + alive≠ready + lease-sweep + same-host supersede + CLOCK_BOOTTIME mono). Stock 0.6.3 is baseline-only — never claim authorizing from it.
2. Lab same-host supersede needs Linux /proc. Run the soak INSIDE a Linux guest (Colima preferred). Do not run celld natively on Darwin for this soak.
3. Mac host must not sleep/suspend for the soak window (pmset + caffeinate). If the Mac sleeps, Colima pauses → harness voids the run.
4. Gates (SOAK_GATES.md): ≥1000 consecutive cycles in ONE non-void run; unique nodes ≤2; readyFails=0; selfFences=0; Wilson UB ≤0.5% each. Do NOT raise CELLD_TTL_MS. Do NOT combine partial/voided runs.
5. Host suspend gap growth >2s voids the run (harness auto-restarts from cycle 0 by default). That is infrastructure, not a software fail. If voided=false, self-fences COUNT — never reclassify them as pause after the fact.
6. Pause-recovery (benchmark:fleet-pause-recovery) is OPTIONAL and SEPARATE — never feeds measured_v4_ready.
7. Do not claim the original TTL3s 2/100 is root-caused. Publish trial5 unsettled; trial1 is journal_surrogate only.
8. Frozen board rules (FROZEN_MISSING_DATA.md) — do not loosen:
   - Every trial persists effect-ledger.json + twin-digest.json (effectLedgerPersisted=true)
   - Outer twin captured:false rate ≤0.02
   - Never set FLEET_PHASED_ALLOW_OVERWRITE=1 (invalidates artifact)
   - during_call: ≥1 callVerifiedSent or status=invalid_phase_targeting
   - Mid-flight: ≤1 effect; every trial outcome_unknown
   - Report midFlightEffectDistribution (effects0/1/2+ + callVerifiedSent)

Procedure:
A. Disable Mac sleep; start/keep Colima; enter the Linux guest.
B. Install deps (Rust toolchain, Node 22+, python3, build-essential) inside the guest if missing.
C. Checkout cursor/mac-mini-v4-authorizing-2725; npm ci (or npm install); cargo build -p celld --release --manifest-path vendor/celld-lab/Cargo.toml. Record sha256 of target/release/celld.
D. Export R2 creds (CLAWQL_R2_ACCOUNT_ID + CLAWQL_SYNC_ACCESS_KEY_ID + CLAWQL_SYNC_SECRET_ACCESS_KEY, or equivalent AWS_* + CELLD_BUCKET). Fresh bucket prefix recommended.
E. Smoke: FLEET_SOAK_CYCLES=12 FLEET_SOAK_MIN_CYCLES=12 with lab CELLD_BIN — expect 0/0 fences/ready and same-host supersede in logs. Not authorizing.
F. Authorizing run: CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld FLEET_SOAK_CYCLES=1000 FLEET_SOAK_MIN_CYCLES=1000 FLEET_SOAK_HOST_LABEL=mac-mini-colima FLEET_SOAK_CELLD_BUILD=lab_expiry_not_dead_fixed FLEET_SOAK_OUT=docs/benchmarks/program-cell-fleet-kill/node-soak-lab-authorizing-mac-mini.json npm run benchmark:fleet-node-soak under caffeinate on the Mac host.
G. Pass only if evidence has voided=false, status=measured_v4_ready, authorizing=true, readyFails=0, selfFences=0, cyclesCompleted≥1000, suspendMonitor.final.growthSec≤2.
H. If soak passes: run v4 N=1000 wedged TTL=3000 with unique FLEET_PHASED_OUT (never overwrite):
   export PATH="$PWD/vendor/celld-lab/target/release:$PATH"
   export CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld
   export FLEET_PHASED_N=1000 FLEET_PHASED_WEDGE_HEALTH=1
   export FLEET_PHASED_SCORE_MODE=correctness_availability_v2
   export FLEET_PHASED_APPEND_LOGS=1 CELLD_TTL_MS=3000
   export FLEET_PHASED_OMIT_REMOVED_CELLD_ENVS=1
   export FLEET_PHASED_FENCE_MODE=lab_enriched_wedged
   export FLEET_PHASED_OUT=$PWD/docs/benchmarks/program-cell-fleet-kill/phased-n1000-v4-mac-mini-ttl3000.json
   # Do NOT set FLEET_PHASED_ALLOW_OVERWRITE
   npm run benchmark:fleet-phased-kill
   Then supersede audit + R2 intent check. Require gates.missingData.pass=true AND gates.phaseValidity.pass=true (during_call callVerifiedSent≥1; midFlightEffectDistribution present). Sibling <evidence>-trials/ must exist with per-trial effect-ledger.json + twin-digest.json.
I. Commit evidence on a branch off cursor/mac-mini-v4-authorizing-2725 and report paths + key fields. Evidence/PR note must say: "TTL3s published 2/100 kept; trial1 injection_missed basis=journal_surrogate effect_ledger=unavailable (not verified); trial5 incomplete_no_pause unsettled; forced-latency arms A/B still open". Do not invent a pass. If void loops or gates fail, stop and report facts.

Read SOAK_GATES.md, SOAK_HOST.md, and FROZEN_MISSING_DATA.md if anything conflicts — gates win.
```

---

## Why Colima / Linux guest (not native Darwin celld)

| Need | Where it lives |
| ---- | -------------- |
| Same-host supersede (`pid` + start ticks + `boot_id`) | Lab `host_process.rs` reads **Linux `/proc`** |
| Suspend void rule | Linux guest: `CLOCK_BOOTTIME − CLOCK_MONOTONIC`; Darwin host helper exists for harness-on-Mac but **celld still must be Linux** |
| Non-pausing host | **Mac sleep off** so Lima/Colima is not frozen mid-soak |

Cloud-agent VMs already failed this: awake windows looked good (~304×0/0) then multi-minute hypervisor pauses caused dual fences. Those runs are **void**, not software fails. See [`SOAK_GATES.md`](./SOAK_GATES.md).

---

## 0. Prerequisites on the Mac host

- Network access to clone the repo and reach Cloudflare R2.
- [Colima](https://github.com/abiosoft/colima) (or Lima / Docker Desktop Linux VM). Colima is the default in this runbook.
- Homebrew optional but useful: `brew install colima docker rustup-init` (Rust may live only inside the guest).
- R2 credentials available to the agent (env file or keychain) — **never commit secrets**.

### Disable Mac sleep for the soak window

```bash
# Record current settings first
pmset -g custom | tee /tmp/pmset-before-soak.txt

# AC power: no sleep (adjust if on battery — prefer plugged in)
sudo pmset -a sleep 0 displaysleep 0 disksleep 0 disablesleep 1 hibernatemode 0

# Keep system awake while Colima / soak runs (leave this terminal open or launchd it)
caffeinate -dims -w $$ &
# or wrap the long soak: caffeinate -dims colima ssh -- '...' 
```

Confirm: `pmset -g` shows sleep disabled; `pgrep caffeinate` is non-empty.

### Start Linux guest

```bash
# Enough CPU/RAM for cargo release + two celld + Node harness
colima start --cpu 4 --memory 8 --disk 60
colima status
colima ssh
# You are now in Linux — remaining steps run here unless noted.
```

If Colima was already running, still verify the **Mac** will not sleep; a sleeping Mac pauses the VM.

---

## 1. Inside the Linux guest — toolchain + checkout

```bash
# Example apt path (Ubuntu/Debian Colima image)
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libssl-dev python3 curl git

# Node 22+ (use whatever the repo engines field expects)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Rust (for vendor/celld-lab)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# Repo — THIS branch
git clone https://github.com/danielsmithdevelopment/ClawQL.git
cd ClawQL
git fetch origin cursor/mac-mini-v4-authorizing-2725
git checkout cursor/mac-mini-v4-authorizing-2725

npm ci
# if npm ci fails on lockfile mismatch: npm install

cargo build -p celld --release --manifest-path vendor/celld-lab/Cargo.toml
test -x vendor/celld-lab/target/release/celld
shasum -a 256 vendor/celld-lab/target/release/celld | tee /tmp/celld-release.sha256
```

---

## 2. R2 / bucket env

Same pattern as board soaks ([`README.md`](./README.md)):

```bash
export CLAWQL_R2_ACCOUNT_ID='…'
export CLAWQL_SYNC_ACCESS_KEY_ID='…'
export CLAWQL_SYNC_SECRET_ACCESS_KEY='…'
# Optional explicit bucket (else harness auto-wires clawql-streams-state/tier-c-soak-*)
export CELLD_BUCKET="s3://clawql-streams-state/tier-c-soak-macmini-$(date +%Y%m%d%H%M%S)"
export S3_ENDPOINT="https://${CLAWQL_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="${CLAWQL_SYNC_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${CLAWQL_SYNC_SECRET_ACCESS_KEY}"
export AWS_REGION=auto
export AWS_EC2_METADATA_DISABLED=true
```

Do **not** raise `CELLD_TTL_MS` (default 10000 for soak). Do **not** set `FLEET_PHASED_FRESH_NODE_IDS=1`. Do **not** set `FLEET_PHASED_ALLOW_OVERWRITE=1`.

---

## 3. Smoke (not authorizing)

```bash
export CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld
export FLEET_SOAK_HOST_LABEL='mac-mini-colima'
export FLEET_SOAK_CYCLES=12
export FLEET_SOAK_MIN_CYCLES=12
export FLEET_SOAK_OUT=$PWD/docs/benchmarks/program-cell-fleet-kill/node-soak-lab-mac-mini-smoke.json

npm run benchmark:fleet-node-soak
```

Expect:

- Log line: `suspend monitor on method=boottime_minus_monotonic` (Linux guest).
- `readyFails=0`, `selfFences=0`, `maxUniqueNodeIds≤2`.
- celld logs mention `same-host supersede` when fencing a dead predecessor (lease remaining).
- Evidence `status` is **not** `measured_v4_ready` (min cycles for authorizing is 1000; smoke uses 12).

If smoke self-fences or ready-fails without a suspend void, **stop** — do not start the 1000-cycle run.

---

## 4. Authorizing soak (the real gate)

Gates: [`SOAK_GATES.md`](./SOAK_GATES.md). Host: [`SOAK_HOST.md`](./SOAK_HOST.md).

```bash
export CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld
export FLEET_SOAK_HOST_LABEL='mac-mini-colima'
export FLEET_SOAK_CELLD_BUILD='lab_expiry_not_dead_fixed'
export FLEET_SOAK_CYCLES=1000
export FLEET_SOAK_MIN_CYCLES=1000
export FLEET_SOAK_REQUIRE_SUSPEND_MONITOR=1
export FLEET_SOAK_VOID_RESTART=1
export FLEET_SOAK_OUT=$PWD/docs/benchmarks/program-cell-fleet-kill/node-soak-lab-authorizing-mac-mini.json

# Prefer wrapping from the Mac host so caffeinate outlives guest SSH:
#   caffeinate -dims colima ssh -- 'cd ~/ClawQL && … npm run benchmark:fleet-node-soak'
npm run benchmark:fleet-node-soak
```

Wall time is **multi-hour** (1000 rebuild cycles with default sleeps/ready waits). Leave the machine plugged in; do not close the lid into sleep.

### Pass criteria (all required)

Evidence JSON must show:

| Field | Required |
| ----- | -------- |
| `voided` | `false` |
| `status` | `measured_v4_ready` |
| `authorizing` | `true` |
| `ok` / `v4SoakOk` | `true` |
| `cyclesCompleted` | `≥ 1000` |
| `readyFails` | `0` |
| `selfFences` | `0` |
| `maxUniqueNodeIds` | `≤ 2` |
| `suspendMonitor.final.growthSec` | `≤ 2` (and not voided) |
| `host.hostLabel` | `mac-mini-colima` (or your label) |

### Void / restart behavior

If suspend-gap growth **> 2s**, harness writes a void artifact, discards partial cycles, and restarts from cycle **0** (`FLEET_SOAK_VOID_RESTART=1`). **Never** stitch voided prefixes onto a later attempt.

If voids keep looping, Mac sleep is still winning — fix `pmset` / `caffeinate` / Colima, do not loosen gates or TTL.

---

## 5. v4 N=1000 (only after `measured_v4_ready`)

Frozen board rules: [`FROZEN_MISSING_DATA.md`](./FROZEN_MISSING_DATA.md).

```bash
export PATH="$PWD/vendor/celld-lab/target/release:$PATH"
export CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld
export FLEET_PHASED_N=1000
export FLEET_PHASED_WEDGE_HEALTH=1
export FLEET_PHASED_SCORE_MODE=correctness_availability_v2
export FLEET_PHASED_APPEND_LOGS=1
export CELLD_TTL_MS=3000
export FLEET_PHASED_OMIT_REMOVED_CELLD_ENVS=1
export FLEET_PHASED_FENCE_MODE=lab_enriched_wedged
export FLEET_PHASED_OUT=$PWD/docs/benchmarks/program-cell-fleet-kill/phased-n1000-v4-mac-mini-ttl3000.json
# NEVER: FLEET_PHASED_ALLOW_OVERWRITE=1

npm run benchmark:fleet-phased-kill
```

### v4 pass / report requirements

| Check | Required |
| ----- | -------- |
| `gates.missingData.pass` | `true` |
| `gates.phaseValidity.pass` | `true` (`during_call` `callVerifiedSent` ≥ 1) |
| `effectLedgerPersisted` | `true` |
| Sibling `<FLEET_PHASED_OUT without .json>-trials/trials/*/effect-ledger.json` | present per trial |
| `midFlightEffectDistribution` | present (effects0/1/2+ + callVerifiedSent) |
| Evidence note | published 2/100 kept; trial1 journal_surrogate; trial5 unsettled |

If `during_call` shows `callVerifiedSent=0`, the board is **`invalid_phase_targeting`** — do not claim a during-call crash test.

---

## 6. After the run

1. Commit soak + v4 evidence (and `*-trials/` ground truth) on a branch off `cursor/mac-mini-v4-authorizing-2725`.
2. Restore Mac power settings if you changed them only for the soak:

```bash
# Example — prefer restoring from /tmp/pmset-before-soak.txt rather than guessing
sudo pmset -a sleep 10 displaysleep 10 disksleep 10 disablesleep 0
# kill leftover caffeinate if desired
```

3. Optional **separate** pause-recovery probe (not a soak pass): see `npm run benchmark:fleet-pause-recovery` / [`SOAK_HOST.md`](./SOAK_HOST.md). On Mac, intentional sleep > TTL then resume; dual fence on resume is expected safety.

---

## 7. Failure cheat sheet

| Symptom | Likely cause | Action |
| ------- | ------------ | ------ |
| Exit 76 / suspend clocks unavailable | Not Linux guest / no python3 | Run inside Colima; install python3 |
| Repeated `void_host_suspend` | Mac slept / VM paused | `pmset` + `caffeinate`; confirm Colima stays up |
| `selfFences>0` without void | Product/regress or wrong binary | Confirm `CELLD_BIN` is lab release; check logs for supersede |
| `readyFails>0` | Fleet not ready in deadline | Check R2, ports, logs; do not raise TTL to hide suspend |
| `maxUniqueNodeIds>2` | Fresh node ids or lease leak | Ensure stable ids; lab sweep present |
| Native Darwin `celld` | No `/proc` host_process | **Invalid** for authorizing soak — use Linux guest |
| `invalid_phase_targeting` | No `during_call` callVerifiedSent | Injection never mid-call — fix hang/wedge path; do not claim during_call |
| `invalidated_overwrite` | `FLEET_PHASED_ALLOW_OVERWRITE=1` | Use a unique `FLEET_PHASED_OUT`; never overwrite |

---

## Related

- Frozen rules: [`FROZEN_MISSING_DATA.md`](./FROZEN_MISSING_DATA.md)
- Gates: [`SOAK_GATES.md`](./SOAK_GATES.md)
- Host: [`SOAK_HOST.md`](./SOAK_HOST.md)
- TTL3s context: [`WEDGE_TTL3S_CORRECTNESS.md`](./WEDGE_TTL3S_CORRECTNESS.md) · [`TTL3S_THREE_CHECKS.md`](./TTL3S_THREE_CHECKS.md)
- Lab: [`vendor/celld-lab/LAB.md`](../../../vendor/celld-lab/LAB.md)
- Harness: [`scripts/benchmarks/fleet-phased-kill/run-node-soak.mjs`](../../../scripts/benchmarks/fleet-phased-kill/run-node-soak.mjs) · [`run-board.mjs`](../../../scripts/benchmarks/fleet-phased-kill/run-board.mjs)
- Suspend helpers: [`scripts/benchmarks/fleet-phased-kill/host-env.mjs`](../../../scripts/benchmarks/fleet-phased-kill/host-env.mjs)
