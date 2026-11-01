/**
 * Host / suspend helpers for fleet soak + pause-recovery boards.
 *
 * Suspend gap (environment-validity signal — not a software pass/fail):
 *   Linux:  CLOCK_BOOTTIME − CLOCK_MONOTONIC grows only while suspended/paused
 *   Darwin: wall (time.time) − CLOCK_MONOTONIC grows while asleep (and also
 *           under large NTP steps — same 2s growth threshold as Linux)
 *
 * Lab celld same-host supersede still needs Linux `/proc` (boot_id + start
 * ticks). On a Mac mini, run the soak **inside** a Linux guest (Colima/Lima)
 * with the Mac host sleep disabled so the guest is not paused. See
 * docs/benchmarks/program-cell-fleet-kill/MAC_MINI_AGENT.md.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { hostname, platform } from "node:os";
import { readFileSync, existsSync } from "node:fs";

/** Default: void the soak if suspend gap grows by more than this many seconds. */
export const DEFAULT_SUSPEND_GAP_GROWTH_SECS = 2;

/**
 * Read suspend-gap clocks via Python (stdlib).
 * Returns null when clocks are unavailable.
 *
 * Shape: { gapSec, method, boottimeSec?, monotonicSec?, wallSec?, at }
 */
export function readSuspendGapClocks() {
  const os = platform();
  const pyLinux = `
import json, time
try:
  boot = time.clock_gettime(time.CLOCK_BOOTTIME)
  mono = time.clock_gettime(time.CLOCK_MONOTONIC)
except Exception as e:
  print(json.dumps({"ok": False, "error": str(e)}))
  raise SystemExit(0)
print(json.dumps({
  "ok": True,
  "method": "boottime_minus_monotonic",
  "boottimeSec": boot,
  "monotonicSec": mono,
  "gapSec": boot - mono
}))
`;
  // Darwin: monotonic freezes across sleep; wall continues → gap grows.
  const pyDarwin = `
import json, time
try:
  mono = time.clock_gettime(time.CLOCK_MONOTONIC)
  wall = time.time()
except Exception as e:
  print(json.dumps({"ok": False, "error": str(e)}))
  raise SystemExit(0)
print(json.dumps({
  "ok": True,
  "method": "wall_minus_monotonic",
  "wallSec": wall,
  "monotonicSec": mono,
  "gapSec": wall - mono
}))
`;
  const py =
    os === "linux" ? pyLinux : os === "darwin" ? pyDarwin : null;
  if (!py) return null;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout?.trim()) {
    return null;
  }
  try {
    const j = JSON.parse(r.stdout.trim().split("\n").pop());
    if (!j?.ok) return null;
    const out = {
      gapSec: Number(j.gapSec),
      method: j.method || "unknown",
      monotonicSec: Number(j.monotonicSec),
      at: new Date().toISOString(),
    };
    if (j.boottimeSec != null) out.boottimeSec = Number(j.boottimeSec);
    if (j.wallSec != null) out.wallSec = Number(j.wallSec);
    return out;
  } catch {
    return null;
  }
}

/**
 * @deprecated Prefer readSuspendGapClocks — kept for pause-recovery callers.
 * Same payload; method may be wall_minus_monotonic on Darwin.
 */
export function readBootMonoClocks() {
  return readSuspendGapClocks();
}

/**
 * Track suspend-gap growth from a baseline sample.
 * growthSec > threshold ⇒ host suspended (or equivalent) during the run.
 */
export function makeSuspendMonitor({
  thresholdSec = DEFAULT_SUSPEND_GAP_GROWTH_SECS,
} = {}) {
  const baseline = readSuspendGapClocks();
  return {
    available: Boolean(baseline),
    method: baseline?.method || null,
    platform: platform(),
    thresholdSec,
    baseline,
    sample() {
      const now = readSuspendGapClocks();
      if (!baseline || !now) {
        return {
          available: false,
          voided: false,
          reason: "clocks_unavailable",
          method: baseline?.method || now?.method || null,
          baseline,
          now,
        };
      }
      const growthSec = now.gapSec - baseline.gapSec;
      const voided = growthSec > thresholdSec;
      return {
        available: true,
        voided,
        growthSec,
        thresholdSec,
        method: now.method,
        baselineGapSec: baseline.gapSec,
        currentGapSec: now.gapSec,
        baseline,
        now,
        reason: voided ? "host_suspend_gap_growth" : null,
      };
    },
  };
}

function sh(cmd) {
  try {
    return execFileSync("bash", ["-lc", cmd], {
      encoding: "utf8",
      timeout: 5_000,
    }).trim();
  } catch {
    return "";
  }
}

function captureLinuxPowerSettings() {
  const unit = (name) => {
    const enabled = sh(`systemctl is-enabled ${name} 2>/dev/null || true`);
    const active = sh(`systemctl is-active ${name} 2>/dev/null || true`);
    return { enabled: enabled || "unknown", active: active || "unknown" };
  };
  const memSleep = existsSync("/sys/power/mem_sleep")
    ? readFileSync("/sys/power/mem_sleep", "utf8").trim()
    : null;
  const diskSleep = existsSync("/sys/power/disk")
    ? readFileSync("/sys/power/disk", "utf8").trim()
    : null;
  return {
    memSleep,
    diskSleep,
    systemd: {
      sleep: unit("sleep.target"),
      suspend: unit("suspend.target"),
      hibernate: unit("hibernate.target"),
      hybridSleep: unit("hybrid-sleep.target"),
    },
    logindIdle: sh(
      "grep -E '^(IdleAction|IdleActionSec|HandleLidSwitch|HandleSuspendKey)' /etc/systemd/logind.conf 2>/dev/null || true"
    ),
    inhibitors: sh("systemd-inhibit --list 2>/dev/null | head -40 || true"),
  };
}

function captureDarwinPowerSettings() {
  return {
    pmset: sh("pmset -g 2>/dev/null || true"),
    pmsetCustom: sh("pmset -g custom 2>/dev/null || true"),
    pmsetAssertions: sh("pmset -g assertions 2>/dev/null | head -60 || true"),
    pmsetSleepDisabled: sh(
      "pmset -g | awk '/SleepDisabled|sleep|disablesleep|hibernatemode|displaysleep|disksleep/{print}' || true"
    ),
    caffeinateRunning: sh(
      "pgrep -l caffeinate 2>/dev/null | head -10 || true"
    ),
    sysctlBoottime: sh("sysctl -n kern.boottime 2>/dev/null || true"),
  };
}

/** Snapshot hostname + power/sleep posture for soak evidence. */
export function captureHostPowerSettings() {
  const os = platform();
  const base = {
    hostname: hostname(),
    hostLabel: process.env.FLEET_SOAK_HOST_LABEL?.trim() || null,
    platform: os,
    uname: sh("uname -a"),
    osReleasePretty:
      os === "darwin"
        ? sh("sw_vers 2>/dev/null | tr '\\n' ' '")
        : sh(
            "grep -E '^(PRETTY_NAME|NAME|VERSION)=' /etc/os-release 2>/dev/null | tr '\\n' ' '"
          ),
    capturedAt: new Date().toISOString(),
  };
  if (os === "darwin") {
    return { ...base, darwin: captureDarwinPowerSettings() };
  }
  if (os === "linux") {
    return { ...base, ...captureLinuxPowerSettings() };
  }
  return base;
}
