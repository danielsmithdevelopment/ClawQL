# Authorizing soak — host requirements

Authorizing overnight soak (`status=measured_v4_ready`) must run on a host that **does not suspend or sleep** for the duration. Cloud-agent VMs that the hypervisor can freeze are **invalid** for that gate (see void rule in [`SOAK_GATES.md`](./SOAK_GATES.md)).

## Mac mini (local agent)

Preferred path when using a Mac mini: **Linux guest via Colima** (lab `host_process` needs `/proc`) with **Mac sleep disabled** so the guest is not paused. Full copy/paste agent prompt + steps: [`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md) on branch `cursor/soak-mac-mini-agent-2725`.

## Recommended: workstation / bare metal

Example: RTX 5090 workstation (or any always-on bare metal) with suspend/sleep disabled for the run.

### Before the run

1. Disable suspend / hibernate / sleep for the soak window (pick what matches the OS):

```bash
# systemd (typical Linux)
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# Confirm
systemctl is-enabled sleep.target suspend.target hibernate.target hybrid-sleep.target
# expect: masked (or disabled)
```

2. Lid / idle (laptops): set logind / DE idle to ignore, or keep AC power and lid open with suspend inhibited.

3. Record settings in evidence via the harness (`host` field). Optionally label:

```bash
export FLEET_SOAK_HOST_LABEL='rtx5090-workstation'
```

4. Build lab binary and run (fresh consecutive ≥1000 cycles; void auto-restarts discard partials):

```bash
cargo build -p celld --release --manifest-path vendor/celld-lab/Cargo.toml
export CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld
export FLEET_SOAK_CYCLES=1000
export FLEET_SOAK_MIN_CYCLES=1000
export FLEET_SOAK_OUT=$PWD/docs/benchmarks/program-cell-fleet-kill/node-soak-lab-authorizing.json
# R2 / CELLD_BUCKET same as board soaks
npm run benchmark:fleet-node-soak
```

5. Confirm evidence: `voided=false`, `status=measured_v4_ready`, `host.systemd.suspend.enabled=masked` (or Darwin `host.darwin.pmset` sleep-off), `suspendMonitor.final.growthSec ≤ 2`, suspend monitor method present (`boottime_minus_monotonic` on Linux).

### After the run

Unmask targets if you masked them only for the soak:

```bash
sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

## Pause-recovery probe (separate)

On a host where you **intentionally** allow suspend for the probe:

```bash
export FLEET_PAUSE_MODE=rtcwake   # or manual
export FLEET_PAUSE_SECS=$(( CELLD_TTL_MS/1000 + 5 ))
export CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld
npm run benchmark:fleet-pause-recovery
```

That evidence is **not** a soak pass. It measures recovery after pause > TTL.
