/**
 * Host / suspend helpers for fleet soak + pause-recovery boards.
 *
 * Linux: CLOCK_BOOTTIME − CLOCK_MONOTONIC grows only while the machine is
 * suspended (or similarly paused by the hypervisor). Used as an
 * environment-validity signal — not a software pass/fail.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { hostname } from "node:os";
import { readFileSync, existsSync } from "node:fs";

/** Default: void the soak if suspend gap grows by more than this many seconds. */
export const DEFAULT_SUSPEND_GAP_GROWTH_SECS = 2;

/**
 * Read CLOCK_BOOTTIME and CLOCK_MONOTONIC via Python (stdlib). Returns null
 * when clocks are unavailable (non-Linux / missing python).
 */
export function readBootMonoClocks() {
  const py = `
import json, time
try:
  boot = time.clock_gettime(time.CLOCK_BOOTTIME)
  mono = time.clock_gettime(time.CLOCK_MONOTONIC)
except Exception as e:
  print(json.dumps({"ok": False, "error": str(e)}))
  raise SystemExit(0)
print(json.dumps({"ok": True, "boottimeSec": boot, "monotonicSec": mono, "gapSec": boot - mono}))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout?.trim()) {
    return null;
  }
  try {
    const j = JSON.parse(r.stdout.trim().split("\n").pop());
    if (!j?.ok) return null;
    return {
      boottimeSec: Number(j.boottimeSec),
      monotonicSec: Number(j.monotonicSec),
      gapSec: Number(j.gapSec),
      at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Track BOOTTIME−MONOTONIC gap growth from a baseline sample.
 * growthSec > threshold ⇒ host suspended (or equivalent) during the run.
 */
export function makeSuspendMonitor({
  thresholdSec = DEFAULT_SUSPEND_GAP_GROWTH_SECS,
} = {}) {
  const baseline = readBootMonoClocks();
  return {
    available: Boolean(baseline),
    thresholdSec,
    baseline,
    sample() {
      const now = readBootMonoClocks();
      if (!baseline || !now) {
        return {
          available: false,
          voided: false,
          reason: "clocks_unavailable",
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

/** Snapshot hostname + power/sleep posture for soak evidence. */
export function captureHostPowerSettings() {
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
    hostname: hostname(),
    hostLabel: process.env.FLEET_SOAK_HOST_LABEL?.trim() || null,
    uname: sh("uname -a"),
    osReleasePretty: sh(
      "grep -E '^(PRETTY_NAME|NAME|VERSION)=' /etc/os-release 2>/dev/null | tr '\\n' ' '"
    ),
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
    capturedAt: new Date().toISOString(),
  };
}
