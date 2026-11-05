# Mac mini local agent — authorizing fleet soak

**Branch:** `cursor/expiry-not-dead-fence-takeover-2725` (fixed lab: expiry≠dead + prior alive/sweep/supersede)  
**Goal:** Run the **authorizing** 1000-cycle soak so evidence reports `status=measured_v4_ready`, then run **v4 N=1000** on this host. Settles the cloud 200-cycle soak’s **3 counted self-fences** (`voided=false` — do not reattribute without a monitor void).

**Context:** N=300 TTL3s passed 0/300 lost (rate bound). Original 2/100 stays **mechanism unexplained** ([`WEDGE_TTL3S_CORRECTNESS.md`](./WEDGE_TTL3S_CORRECTNESS.md) · [`AMBIGUOUS_RENEWAL.md`](./AMBIGUOUS_RENEWAL.md)). Report that open mechanism alongside v4.

This file is the runbook. Paste the **Local agent prompt** block below into your Mac mini agent.

---

## Local agent prompt (copy/paste)

```text
You are on a Mac mini. Checkout branch cursor/expiry-not-dead-fence-takeover-2725 of danielsmithdevelopment/ClawQL and follow docs/benchmarks/program-cell-fleet-kill/MAC_MINI_AGENT.md exactly.

Mission: (1) authorize pre-v4 fleet readiness — lab celld node soak to status=measured_v4_ready; (2) if soak passes, run v4 N=1000 wedged TTL=3000 with append logs + R2 intent check; (3) always report the open TTL3s 2/100 mechanism (unexplained; ambiguous-renewal lead) alongside results.

Hard constraints (do not renegotiate):
1. Use the lab binary built from vendor/celld-lab on THIS branch (expiry≠dead + alive≠ready + lease-sweep + same-host supersede). Stock 0.6.3 is baseline-only — never claim authorizing from it.
2. Lab same-host supersede needs Linux /proc. Run the soak INSIDE a Linux guest (Colima preferred). Do not run celld natively on Darwin for this soak.
3. Mac host must not sleep/suspend for the soak window (pmset + caffeinate). If the Mac sleeps, Colima pauses → harness voids the run.
4. Gates (SOAK_GATES.md): ≥1000 consecutive cycles in ONE non-void run; unique nodes ≤2; readyFails=0; selfFences=0; Wilson UB ≤0.5% each. Do NOT raise CELLD_TTL_MS. Do NOT combine partial/voided runs.
5. Host suspend gap growth >2s voids the run (harness auto-restarts from cycle 0 by default). That is infrastructure, not a software fail. If voided=false, self-fences COUNT — never reclassify them as pause after the fact.
6. Pause-recovery (benchmark:fleet-pause-recovery) is OPTIONAL and SEPARATE — never feeds measured_v4_ready.
7. Do not claim the original TTL3s 2/100 is root-caused. N=300 zeros bound rate only. Publish mechanism unexplained.

Procedure:
A. Disable Mac sleep; start/keep Colima; enter the Linux guest.
B. Install deps (Rust toolchain, Node 22+, python3, build-essential) inside the guest if missing.
C. Checkout cursor/expiry-not-dead-fence-takeover-2725; npm ci (or npm install); cargo build -p celld --release --manifest-path vendor/celld-lab/Cargo.toml. Record sha256 of target/release/celld.
D. Export R2 creds (CLAWQL_R2_ACCOUNT_ID + CLAWQL_SYNC_ACCESS_KEY_ID + CLAWQL_SYNC_SECRET_ACCESS_KEY, or equivalent AWS_* + CELLD_BUCKET). Fresh bucket prefix recommended.
E. Smoke: FLEET_SOAK_CYCLES=12 FLEET_SOAK_MIN_CYCLES=12 with lab CELLD_BIN — expect 0/0 fences/ready and same-host supersede in logs. Not authorizing.
F. Authorizing run: CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld FLEET_SOAK_CYCLES=1000 FLEET_SOAK_MIN_CYCLES=1000 FLEET_SOAK_HOST_LABEL=mac-mini-colima FLEET_SOAK_CELLD_BUILD=lab_expiry_not_dead_fixed FLEET_SOAK_OUT=docs/benchmarks/program-cell-fleet-kill/node-soak-lab-authorizing-mac-mini.json npm run benchmark:fleet-node-soak under caffeinate on the Mac host.
G. Pass only if evidence has voided=false, status=measured_v4_ready, authorizing=true, readyFails=0, selfFences=0, cyclesCompleted≥1000, suspendMonitor.final.growthSec≤2.
H. If soak passes: run v4 N=1000 wedged TTL=3000 (FLEET_PHASED_N=1000 FLEET_PHASED_WEDGE_HEALTH=1 FLEET_PHASED_SCORE_MODE=correctness_availability_v2 FLEET_PHASED_APPEND_LOGS=1 CELLD_TTL_MS=3000 FLEET_PHASED_OMIT_REMOVED_CELLD_ENVS=1 FLEET_PHASED_FENCE_MODE=lab_enriched_wedged) with PATH/CELLD_BIN on the same lab binary; supersede audit + R2 intent check; evidence under docs/benchmarks/program-cell-fleet-kill/. In the evidence/PR note: "TTL3s 2/100 mechanism unexplained (ambiguous-renewal lead)".
I. Commit evidence on a branch off this one and report paths + key fields. Do not invent a pass. If void loops or gates fail, stop and report facts.

Read SOAK_GATES.md and SOAK_HOST.md if anything conflicts — gates win.
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

# Repo
git clone https://github.com/danielsmithdevelopment/ClawQL.git
cd ClawQL
git fetch origin cursor/expiry-not-dead-fence-takeover-2725
git checkout cursor/expiry-not-dead-fence-takeover-2725

npm ci
# if npm ci fails on lockfile mismatch: npm install

cargo build -p celld --release --manifest-path vendor/celld-lab/Cargo.toml
test -x vendor/celld-lab/target/release/celld
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

Do **not** raise `CELLD_TTL_MS` (default 10000). Do **not** set `FLEET_PHASED_FRESH_NODE_IDS=1`.

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
| `celldBuild` | `lab_fixed_alive_sweep_supersede` |
| `suspendMonitor.final.growthSec` | `≤ 2` (and not voided) |
| `host.hostLabel` | `mac-mini-colima` (or your label) |

### Void / restart behavior

If suspend-gap growth **> 2s**, harness writes a void artifact, discards partial cycles, and restarts from cycle **0** (`FLEET_SOAK_VOID_RESTART=1`). **Never** stitch voided prefixes onto a later attempt.

If voids keep looping, Mac sleep is still winning — fix `pmset` / `caffeinate` / Colima, do not loosen gates or TTL.

---

## 5. After the run

1. Copy or commit `node-soak-lab-authorizing-mac-mini.json` (and any `*-void-attempt*.json` if present).
2. Restore Mac power settings if you changed them only for the soak:

```bash
# Example — prefer restoring from /tmp/pmset-before-soak.txt rather than guessing
sudo pmset -a sleep 10 displaysleep 10 disksleep 10 disablesleep 0
# kill leftover caffeinate if desired
```

3. Optional **separate** pause-recovery probe (not a soak pass): see `npm run benchmark:fleet-pause-recovery` / [`SOAK_HOST.md`](./SOAK_HOST.md). On Mac, intentional sleep > TTL then resume; dual fence on resume is expected safety.

---

## 6. Failure cheat sheet

| Symptom | Likely cause | Action |
| ------- | ------------ | ------ |
| Exit 76 / suspend clocks unavailable | Not Linux guest / no python3 | Run inside Colima; install python3 |
| Repeated `void_host_suspend` | Mac slept / VM paused | `pmset` + `caffeinate`; confirm Colima stays up |
| `selfFences>0` without void | Product/regress or wrong binary | Confirm `CELLD_BIN` is lab release; check logs for supersede |
| `readyFails>0` | Fleet not ready in deadline | Check R2, ports, logs; do not raise TTL to hide suspend |
| `maxUniqueNodeIds>2` | Fresh node ids or lease leak | Ensure stable ids; lab sweep present |
| Native Darwin `celld` | No `/proc` host_process | **Invalid** for authorizing soak — use Linux guest |

---

## Related

- Gates: [`SOAK_GATES.md`](./SOAK_GATES.md)
- Host: [`SOAK_HOST.md`](./SOAK_HOST.md)
- Lab: [`vendor/celld-lab/LAB.md`](../../../vendor/celld-lab/LAB.md)
- Harness: [`scripts/benchmarks/fleet-phased-kill/run-node-soak.mjs`](../../../scripts/benchmarks/fleet-phased-kill/run-node-soak.mjs)
- Suspend helpers: [`scripts/benchmarks/fleet-phased-kill/host-env.mjs`](../../../scripts/benchmarks/fleet-phased-kill/host-env.mjs)
