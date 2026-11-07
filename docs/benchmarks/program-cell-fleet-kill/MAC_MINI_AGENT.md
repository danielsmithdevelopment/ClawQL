# Mac mini local agent — identity remesure (authorize v4)

**Branch to check out:** `cursor/mac-mini-v4-authorizing-2725`  
**Contains:** expiry≠dead lab celld + BOOTTIME + harness freezes + `celld-identity.mjs` (records `celldLabGitCommit` + `celldSha256` on soak and board).  
**Current publish status:** [**v4 passed; authorization pending binary-identity remesure**](./V4_CLAIM.md). Mechanism claim stays paused until this remesure.

**Prior Mac mini run (keep; do not overwrite):** soak + v4 N=1000 measured and real, but v4 omitted binary identity. Flagship claim requires matching identity **inside** both artifacts — not a reasonable story. See [`mac-mini-v4-binary-authorization.json`](./mac-mini-v4-binary-authorization.json).

**Context (do not rewrite):**
- Published TTL3s N=100 **2 × `lost_midflight_intent`** stays as-is.
- Trial 1 = `injection_missed` / `journal_surrogate` (**not** verified); trial 5 = `incomplete_no_pause` (**unsettled**).
- During-call on the prior board was 251× `effects0` — do not imply that phase covered both effect outcomes.

Paste the **Local agent prompt** below into the Mac mini agent.

---

## Local agent prompt (copy/paste) — forensic + identity remesure

```text
You are on a Mac mini. Checkout branch cursor/mac-mini-v4-authorizing-2725 of danielsmithdevelopment/ClawQL and follow docs/benchmarks/program-cell-fleet-kill/MAC_MINI_AGENT.md § identity remesure exactly.

Mission:
1) Cheap forensic check on the prior binary (if still on disk) — supporting evidence only, labeled reconstructed_after_the_fact.
2) Identity remesure: ONE cargo build, then authorizing 1000-cycle soak AND v4 N=1000 wedged TTL=3000, with celldLabGitCommit + celldSha256 recorded and MATCHING in both artifacts.
3) Do not restore the mechanism claim yourself. Prior v4 results stay published as measured; claim stays paused until humans confirm matching identity.
4) Always report: TTL3s published 2/100 kept; trial1 journal_surrogate (not verified); trial5 unsettled; forced-latency A/B open.

Hard constraints:
1. Lab binary from vendor/celld-lab on THIS branch only (expiry≠dead + alive≠ready + lease-sweep + same-host supersede + CLOCK_BOOTTIME). Never authorize from stock 0.6.3 alone.
2. Run celld inside Colima Linux guest (/proc). Mac must not sleep (pmset + caffeinate).
3. Gates unchanged (SOAK_GATES.md / FROZEN_MISSING_DATA.md). Never FLEET_PHASED_ALLOW_OVERWRITE=1. Never raise CELLD_TTL_MS for soak. Never combine voided runs.
4. UNIQUE out paths for remesure — do not overwrite prior evidence:
   - soak: docs/benchmarks/program-cell-fleet-kill/node-soak-lab-authorizing-mac-mini-identity-remeasure.json
   - v4:   docs/benchmarks/program-cell-fleet-kill/phased-n1000-v4-mac-mini-ttl3000-identity-remeasure.json
5. Build ONCE. Do not rebuild between soak and v4. Prefer: build → record sha → soak → v4 with same CELLD_BIN.
6. Authorization pass only when soak.celldLabGitCommit == v4.celldLabGitCommit AND soak.celldSha256 == v4.celldSha256 (both non-null).

Procedure:
A. Forensic (before any rebuild). Bin path from prior soak: /Users/danielsmith/ClawQL/vendor/celld-lab/target/release/celld
   if [ -x "$BIN" ]; then
     SHA=$(shasum -a 256 "$BIN" | awk '{print $1}')
     STAT=$(stat -f '%Sm %N' -t '%Y-%m-%dT%H:%M:%SZ' "$BIN" 2>/dev/null || stat -c '%y %n' "$BIN")
     # Also record epoch mtime; soak measuredAt=2026-11-06T23:52:09.341Z; host.capturedAt=2026-11-06T21:01:31.055Z
     # Prefer mtime BEFORE soak start. Append into docs/benchmarks/program-cell-fleet-kill/mac-mini-v4-binary-authorization.json under forensicCheck.results with reconstructed_after_the_fact=true.
   fi
   If missing/rebuilt already, record forensicCheck.results.status=unavailable and continue to remesure.

B. Disable Mac sleep; Colima up; enter Linux guest; deps if needed.
C. git fetch && git checkout cursor/mac-mini-v4-authorizing-2725 && npm ci
D. cargo build -p celld --release --manifest-path vendor/celld-lab/Cargo.toml
   export CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld
   shasum -a 256 "$CELLD_BIN" | tee /tmp/celld-identity-remeasure.sha256
   # Do not cargo build again until both soak and v4 finish.

E. Smoke 12 cycles (not authorizing).

F. Authorizing soak (identity remesure out path):
   export FLEET_SOAK_HOST_LABEL=mac-mini-colima
   export FLEET_SOAK_CELLD_BUILD=lab_expiry_not_dead_fixed
   export FLEET_SOAK_CYCLES=1000 FLEET_SOAK_MIN_CYCLES=1000
   export FLEET_SOAK_OUT=$PWD/docs/benchmarks/program-cell-fleet-kill/node-soak-lab-authorizing-mac-mini-identity-remeasure.json
   npm run benchmark:fleet-node-soak
   Require: voided=false, status=measured_v4_ready, celldLabGitCommit and celldSha256 present.

G. Immediately v4 (same CELLD_BIN, no rebuild):
   export PATH="$(dirname "$CELLD_BIN"):$PATH"
   export FLEET_PHASED_N=1000 FLEET_PHASED_WEDGE_HEALTH=1
   export FLEET_PHASED_SCORE_MODE=correctness_availability_v2
   export FLEET_PHASED_APPEND_LOGS=1 CELLD_TTL_MS=3000
   export FLEET_PHASED_OMIT_REMOVED_CELLD_ENVS=1
   export FLEET_PHASED_FENCE_MODE=lab_enriched_wedged
   export FLEET_PHASED_OUT=$PWD/docs/benchmarks/program-cell-fleet-kill/phased-n1000-v4-mac-mini-ttl3000-identity-remeasure.json
   npm run benchmark:fleet-phased-kill
   Require: ok=true; gates.missingData.pass; gates.phaseValidity.pass; callSent intent-visible; celldLabGitCommit+celldSha256 present and EQUAL to soak.

H. Update mac-mini-v4-binary-authorization.json: forensicCheck.results (if any); identityRemeasure.status=complete with both paths + matching commit/sha. Do not set mechanismClaim to restored.

I. Commit on a branch off cursor/mac-mini-v4-authorizing-2725. PR note must say publish label remains "v4 passed; authorization pending…" until a human restores the claim after verifying matching identity. Keep TTL3s 2/100 / trial1 / trial5 open beside results.

Read SOAK_GATES.md, FROZEN_MISSING_DATA.md, V4_CLAIM.md — gates and paused claim win over optimism.
```

---

## Identity remesure outs (do not overwrite prior evidence)

| Run | Path |
| --- | ---- |
| Forensic results | append `forensicCheck.results` in [`mac-mini-v4-binary-authorization.json`](./mac-mini-v4-binary-authorization.json) |
| Soak remesure | `node-soak-lab-authorizing-mac-mini-identity-remeasure.json` |
| v4 remesure | `phased-n1000-v4-mac-mini-ttl3000-identity-remeasure.json` (+ `-trials/`) |

Prior measured board (`phased-n1000-v4-mac-mini-ttl3000.json`) stays as published measured evidence under the paused-claim label.

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
# Prefer commit+sha over this label. Older harnesses hard-coded lab_fixed_alive_sweep_supersede for any vendor/celld-lab path — that string alone does not prove missing expiry≠dead.
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
