#!/usr/bin/env node
/**
 * Pause / suspend recovery probe — **separate from soak gates**.
 *
 * Product question (pause-aware clocks): after the host is suspended longer
 * than the lease TTL, both nodes fencing on resume is correct for safety.
 * What matters next: does the fleet recover on its own, and how quickly?
 *
 * Modes (FLEET_PAUSE_MODE):
 *   rtcwake  — real suspend via `rtcwake -m mem -s <secs>` (needs root / CAP;
 *              use on workstation with suspend allowed for this probe only)
 *   manual   — print instructions; wait until BOOTTIME−MONOTONIC gap grows,
 *              then measure recovery (operator triggers suspend/resume)
 *   sigstop  — SIGSTOP both celld PIDs for pauseSecs (process freeze only —
 *              clocks keep running; **not** equivalent to host suspend;
 *              labeled proxy for local harness debug)
 *
 * Evidence never feeds SOAK_GATES / measured_v4_ready.
 */
import { spawn, execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  openSync,
  unlinkSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureHostPowerSettings,
  makeSuspendMonitor,
  readBootMonoClocks,
} from "./host-env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const STREAMS = join(REPO, "docs/examples/streams-celld");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function freePortHard(port) {
  try {
    execFileSync("bash", ["-lc", `fuser -k ${port}/tcp 2>/dev/null || true`], {
      stdio: "ignore",
    });
  } catch {
    /* */
  }
}

async function waitPortFree(port, wallMs = 15_000) {
  const deadline = Date.now() + wallMs;
  while (Date.now() < deadline) {
    const free = await new Promise((resolve) => {
      const s = createServer();
      s.once("error", () => resolve(false));
      s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
    });
    if (free) return;
    await sleep(200);
  }
  throw new Error(`port ${port} still busy`);
}

function spawnLogged(bin, args, logPath, env, cwd) {
  const fd = openSync(logPath, "a");
  return spawn(bin, args, { env, cwd, stdio: ["ignore", fd, fd] });
}

async function waitUrl(url, pred, { attempts = 60, timeoutMs = 1500, wallMs = 60_000 } = {}) {
  const deadline = Date.now() + wallMs;
  let last;
  for (let i = 0; i < attempts && Date.now() < deadline; i++) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), timeoutMs);
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(t);
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      last = { ok: res.ok, status: res.status, body };
      if (pred(last)) return last;
    } catch (e) {
      last = { error: String(e) };
    }
    await sleep(250);
  }
  throw new Error(`waitUrl ${url} failed: ${JSON.stringify(last)}`);
}

function autoWireR2() {
  if (process.env.CELLD_BUCKET) return;
  const account =
    process.env.CLAWQL_R2_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID;
  const key = process.env.CLAWQL_SYNC_ACCESS_KEY_ID || process.env.CLOUDFLARE_ACCESS_KEY_ID;
  const secret =
    process.env.CLAWQL_SYNC_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_SECRET_ACCESS_KEY;
  if (!account || !key || !secret) return;
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  process.env.CELLD_BUCKET = `s3://clawql-streams-state/tier-c-pause-${stamp}`;
  process.env.S3_ENDPOINT =
    process.env.S3_ENDPOINT || `https://${account}.r2.cloudflarestorage.com`;
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || key;
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || secret;
  process.env.AWS_REGION = process.env.AWS_REGION || "auto";
  process.env.AWS_EC2_METADATA_DISABLED = "true";
}

autoWireR2();

const MODE = (process.env.FLEET_PAUSE_MODE || "manual").toLowerCase();
const CELLD_TTL_MS = Math.max(1_000, Number(process.env.CELLD_TTL_MS || 10_000));
const PAUSE_SECS = Math.max(
  Math.ceil(CELLD_TTL_MS / 1000) + 2,
  Number(process.env.FLEET_PAUSE_SECS || Math.ceil(CELLD_TTL_MS / 1000) + 5)
);
const CELLD_BIN = process.env.CELLD_BIN?.trim() || "celld";
const PORT_A = Number(process.env.PROGRAM_CELL_FLEET_PORT_A || 9881);
const PORT_B = Number(process.env.PROGRAM_CELL_FLEET_PORT_B || 9882);
const INTERNAL_A = Number(process.env.PROGRAM_CELL_FLEET_INTERNAL_A || 9883);
const INTERNAL_B = Number(process.env.PROGRAM_CELL_FLEET_INTERNAL_B || 9884);
const PETS_PORT = Number(process.env.FLEET_PAUSE_PETS_PORT || 9899);
const REGION = process.env.AWS_REGION || "auto";
const endpointArgs = process.env.S3_ENDPOINT ? ["--endpoint", process.env.S3_ENDPOINT] : [];
const OUT =
  process.env.FLEET_PAUSE_OUT ||
  join(REPO, "docs/benchmarks/program-cell-fleet-kill/pause-recovery-evidence.json");
const STABLE = { A: "pause_A", B: "pause_B" };

if (!process.env.CELLD_BUCKET) {
  console.error("pause-recovery: CELLD_BUCKET required");
  process.exit(2);
}

const nodes = {
  A: { port: PORT_A, internal: INTERNAL_A, pid: null, log: "/tmp/fleet-pause-a.log" },
  B: { port: PORT_B, internal: INTERNAL_B, pid: null, log: "/tmp/fleet-pause-b.log" },
};

async function startNode(name) {
  const n = nodes[name];
  if (n.pid) {
    try {
      process.kill(n.pid, "SIGKILL");
    } catch {
      /* */
    }
    n.pid = null;
  }
  freePortHard(n.port);
  freePortHard(n.internal);
  await waitPortFree(n.port);
  await waitPortFree(n.internal);
  const child = spawnLogged(
    CELLD_BIN,
    [
      "--bucket",
      process.env.CELLD_BUCKET,
      "--region",
      REGION,
      ...endpointArgs,
      "--listen",
      `127.0.0.1:${n.port}`,
      "--internal-listen",
      `127.0.0.1:${n.internal}`,
      "--advertise",
      `127.0.0.1:${n.internal}`,
    ],
    n.log,
    {
      ...process.env,
      CELLD_NODE: STABLE[name],
      CELLD_TTL_MS: String(CELLD_TTL_MS),
      AWS_EC2_METADATA_DISABLED: "true",
    },
    STREAMS
  );
  n.pid = child.pid;
  n.exited = null;
  child.on("exit", (code, signal) => {
    if (n.pid === child.pid) n.pid = null;
    n.exited = { code, signal, at: new Date().toISOString(), selfFence: code === 3 };
  });
}

async function waitReady(name, wallMs = 60_000) {
  const base = `http://127.0.0.1:${nodes[name].port}`;
  try {
    await waitUrl(
      `${base}/.well-known/celld/alive`,
      (r) => r.ok && (r.body?.alive === true || r.body?.ok === true),
      { attempts: 40, timeoutMs: 1_000, wallMs: Math.min(15_000, wallMs) }
    );
  } catch {
    /* stock may lack /alive */
  }
  await waitUrl(`${base}/.well-known/celld/health`, (r) => r.ok, {
    attempts: 120,
    timeoutMs: 1_500,
    wallMs,
  });
}

async function deploy() {
  freePortHard(PETS_PORT);
  const petsLog = `/tmp/fleet-pause-pets-${PETS_PORT}.log`;
  writeFileSync(petsLog, "");
  const pets = spawnLogged(
    process.execPath,
    [join(STREAMS, "scripts/mock-pets-upstream.mjs"), String(PETS_PORT)],
    petsLog,
    { ...process.env, MOCK_PETS_PORT: String(PETS_PORT) },
    STREAMS
  );
  await waitUrl(`http://127.0.0.1:${PETS_PORT}/healthz`, (r) => r.ok || r.body?.ok === true, {
    attempts: 40,
    wallMs: 10_000,
  });
  const cfg = join(STREAMS, "wrangler.program-cell-fleet-pause.jsonc");
  const src = readFileSync(join(STREAMS, "wrangler.jsonc"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const wrangler = JSON.parse(src);
  wrangler.vars = wrangler.vars || {};
  wrangler.vars.CLAWQL_CORE_UPSTREAM = `http://127.0.0.1:${PETS_PORT}`;
  wrangler.vars.CLAWQL_MCP_URL = "";
  wrangler.vars.INFERENCE_URL = "";
  writeFileSync(cfg, JSON.stringify(wrangler, null, 2) + "\n");
  const deploy = spawn(
    CELLD_BIN,
    ["deploy", cfg, "--bucket", process.env.CELLD_BUCKET, "--region", REGION, ...endpointArgs],
    { cwd: STREAMS, env: process.env, stdio: "inherit" }
  );
  await new Promise((resolve, reject) => {
    deploy.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`deploy exited ${code}`))
    );
  });
  return pets;
}

async function inducePause(mon) {
  const before = mon.sample();
  if (MODE === "sigstop") {
    console.warn(
      `pause-recovery: SIGSTOP both nodes for ${PAUSE_SECS}s (proxy only — not host suspend)`
    );
    for (const name of ["A", "B"]) {
      if (nodes[name].pid) process.kill(nodes[name].pid, "SIGSTOP");
    }
    await sleep(PAUSE_SECS * 1000);
    for (const name of ["A", "B"]) {
      if (nodes[name].pid) process.kill(nodes[name].pid, "SIGCONT");
    }
    return { mode: "sigstop", pauseSecs: PAUSE_SECS, before, after: mon.sample() };
  }
  if (MODE === "rtcwake") {
    console.warn(`pause-recovery: rtcwake -m mem -s ${PAUSE_SECS}`);
    execFileSync("rtcwake", ["-m", "mem", "-s", String(PAUSE_SECS)], { stdio: "inherit" });
    return { mode: "rtcwake", pauseSecs: PAUSE_SECS, before, after: mon.sample() };
  }
  // manual
  const baselineGap = before.currentGapSec ?? before.baseline?.gapSec;
  console.log(
    JSON.stringify(
      {
        action: "manual_suspend",
        instruction: `Suspend this machine for at least ${PAUSE_SECS}s (longer than CELLD_TTL_MS=${CELLD_TTL_MS}), then resume. Waiting for BOOTTIME−MONOTONIC gap growth > 2s…`,
        baselineGapSec: baselineGap,
      },
      null,
      2
    )
  );
  const deadline = Date.now() + Math.max(PAUSE_SECS, 120) * 1000 + 600_000;
  while (Date.now() < deadline) {
    await sleep(1_000);
    const s = mon.sample();
    if (s.voided || (s.growthSec ?? 0) > 2) {
      return { mode: "manual", pauseSecs: PAUSE_SECS, before, after: s };
    }
  }
  throw new Error("manual suspend not observed (gap did not grow)");
}

async function main() {
  process.env.CELLD_TTL_MS = String(CELLD_TTL_MS);
  writeFileSync(nodes.A.log, "");
  writeFileSync(nodes.B.log, "");
  for (const p of [PORT_A, PORT_B, INTERNAL_A, INTERNAL_B, PETS_PORT]) freePortHard(p);
  await sleep(300);

  const host = captureHostPowerSettings();
  const mon = makeSuspendMonitor({ thresholdSec: 2 });
  const pets = await deploy();
  await startNode("A");
  await startNode("B");
  await sleep(2000);
  await waitReady("A");
  await waitReady("B");
  const healthyBefore = { at: new Date().toISOString(), clocks: readBootMonoClocks() };
  console.log("pause-recovery: fleet healthy before pause");

  const pause = await inducePause(mon);
  const resumeAt = Date.now();
  const resumeIso = new Date().toISOString();

  // Measure recovery: both nodes answering readiness again (may need restart
  // after self-fence — that is part of the measured behavior).
  let recoveredAt = null;
  let recoverError = null;
  let fences = { A: nodes.A.exited, B: nodes.B.exited };
  try {
    // Give fenced processes a moment to exit; restart if needed.
    await sleep(1_500);
    fences = { A: nodes.A.exited, B: nodes.B.exited };
    for (const name of ["A", "B"]) {
      if (!nodes[name].pid) {
        await startNode(name);
      }
    }
    await waitReady("A", 120_000);
    await waitReady("B", 120_000);
    recoveredAt = Date.now();
  } catch (e) {
    recoverError = String(e);
  }

  const recoveryMs = recoveredAt != null ? recoveredAt - resumeAt : null;
  const evidence = {
    kind: "celld-fleet-pause-recovery",
    role: "pause_recovery_probe",
    authorizing: false,
    notSoakGate: true,
    honesty:
      "Separate from SOAK_GATES. Dual fence on resume after pause > TTL is expected safety. This board measures post-resume recovery time to a healthy fleet. sigstop mode is a process-freeze proxy only (clocks keep running).",
    mode: MODE,
    celldBin: CELLD_BIN,
    celldTtlMs: CELLD_TTL_MS,
    pauseSecsRequested: PAUSE_SECS,
    host,
    pause,
    healthyBefore,
    resumeAt: resumeIso,
    exitsObserved: fences,
    recoveryMs,
    recoverError,
    recovered: recoveryMs != null,
    measuredAt: new Date().toISOString(),
  };

  for (const name of ["A", "B"]) {
    if (nodes[name].pid) {
      try {
        process.kill(nodes[name].pid, "SIGKILL");
      } catch {
        /* */
      }
    }
  }
  if (pets?.pid) {
    try {
      process.kill(pets.pid, "SIGKILL");
    } catch {
      /* */
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `pause-recovery: wrote ${OUT} recovered=${evidence.recovered} recoveryMs=${recoveryMs} mode=${MODE}`
  );
  process.exit(evidence.recovered ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
