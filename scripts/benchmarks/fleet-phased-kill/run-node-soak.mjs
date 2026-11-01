#!/usr/bin/env node
/**
 * Pre-v4 fleet soak — prove the fleet stays v4-ready under rebuild pressure.
 *
 * v3 diagnosis: fresh CELLD_NODE every restart → 712 unique nodes/* (accumulation).
 * Stable ids alone stop accumulation but collide with the prior lease → self-fence
 * / TTL waits / ready flakes. Product fix (before a passing soak / v4):
 *   stable node id + incarnation supersede-when-dead + lease-sweep + alive≠ready.
 *
 * Pass criteria (defaults) — see docs/.../SOAK_GATES.md:
 *   1. unique R2 nodes/* ≤ FLEET_SOAK_NODE_CEILING (default 2)
 *   2. readyFails/cycles observed AND 95% Wilson UB ≤ READY_RATE_CEILING (0.5%)
 *   3. selfFences/cycles observed AND 95% Wilson UB ≤ FENCE_RATE_CEILING (0.5%)
 *   4. cyclesCompleted ≥ FLEET_SOAK_MIN_CYCLES (default 1000 overnight)
 * At n=1000, Wilson UB≤0.5% is effectively 0 events/gate (1 event → UB≈0.56%).
 * Strict by design (not ~1% UB). n=240 cannot show 0.5%.
 *
 * Env:
 *   FLEET_SOAK_CYCLES              rebuild cycles (default 30; use ≥1000 for v4 gate)
 *   FLEET_SOAK_MIN_CYCLES          floor for measured_v4_ready (default 1000)
 *   FLEET_SOAK_SLEEP_MS            pause between cycles (default 2000)
 *   FLEET_SOAK_NODE_CEILING        max unique nodes/* (default 2)
 *   FLEET_SOAK_READY_RATE_CEILING  readyFail rate cap (default 0.005)
 *   FLEET_SOAK_FENCE_RATE_CEILING  selfFence rate cap (default 0.005)
 *   FLEET_SOAK_OUT                 evidence JSON path
 *   FLEET_SOAK_REQUIRE_PROGRAM     1=wait /program/health each cycle (default 1)
 *   FLEET_SOAK_SUSPEND_GAP_SECS    void if BOOTTIME−MONOTONIC growth > this (default 2)
 *   FLEET_SOAK_VOID_RESTART        1=on void, discard run and restart from cycle 0 (default 1)
 *   FLEET_SOAK_HOST_LABEL          human host name recorded in evidence
 *   CELLD_TTL_MS / CELLD_BUCKET / R2 creds — same as run-board.mjs
 *   FLEET_PHASED_FRESH_NODE_IDS must stay unset/0 for a meaningful pass
 *
 * Environment validity (SOAK_GATES.md): if CLOCK_BOOTTIME−CLOCK_MONOTONIC grows
 * by more than FLEET_SOAK_SUSPEND_GAP_SECS during a run, that run is **void** —
 * recorded, not counted, never a pass. Partial voided cycles are never combined
 * with a later attempt; authorizing needs ≥1000 consecutive cycles in one run.
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
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import {
  captureHostPowerSettings,
  makeSuspendMonitor,
  DEFAULT_SUSPEND_GAP_GROWTH_SECS,
} from "./host-env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const STREAMS = join(REPO, "docs/examples/streams-celld");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wilson score 95% upper bound for k events in n Bernoulli trials.
 * With k=0 this is slightly tighter than rule-of-three 3/n; both require n≳600
 * before a zero-event UB sits at or below 0.5%.
 */
function wilsonUpper95(k, n) {
  if (!n || n <= 0) return 1;
  const z = 1.96;
  const phat = Math.max(0, Math.min(1, k / n));
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return Math.min(1, (center + margin) / denom);
}

/** Rule-of-three 95% UB when k=0 (documented companion to Wilson). */
function ruleOfThreeUpper95(k, n) {
  if (!n || n <= 0) return 1;
  if (k === 0) return Math.min(1, 3 / n);
  return null;
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
  throw new Error(`port ${port} still busy after ${wallMs}ms`);
}

function freePortHard(port) {
  try {
    execFileSync("bash", ["-lc", `fuser -k ${port}/tcp 2>/dev/null || true`], {
      stdio: "ignore",
    });
  } catch {
    /* best-effort */
  }
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
  process.env.CELLD_BUCKET = `s3://clawql-streams-state/tier-c-soak-${stamp}`;
  process.env.S3_ENDPOINT =
    process.env.S3_ENDPOINT || `https://${account}.r2.cloudflarestorage.com`;
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || key;
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || secret;
  process.env.AWS_REGION = process.env.AWS_REGION || "auto";
  process.env.AWS_EC2_METADATA_DISABLED = "true";
  console.log("fleet-soak: auto-wired R2 (bucket redacted in evidence)");
}

autoWireR2();

const CYCLES = Math.max(1, Number(process.env.FLEET_SOAK_CYCLES || 30));
/** Floor for a v4-authorizing soak (prefer 1000; rule-of-three zero-event floor is 600). */
const MIN_CYCLES = Math.max(1, Number(process.env.FLEET_SOAK_MIN_CYCLES || 1000));
const SLEEP_MS = Math.max(0, Number(process.env.FLEET_SOAK_SLEEP_MS || 2000));
const NODE_CEILING = Math.max(2, Number(process.env.FLEET_SOAK_NODE_CEILING || 2));
/** Headroom under board avail ceiling 2% — default 0.5% each. */
const READY_RATE_CEILING = Math.min(
  1,
  Math.max(0, Number(process.env.FLEET_SOAK_READY_RATE_CEILING ?? 0.005))
);
const FENCE_RATE_CEILING = Math.min(
  1,
  Math.max(0, Number(process.env.FLEET_SOAK_FENCE_RATE_CEILING ?? 0.005))
);
const REQUIRE_PROGRAM = process.env.FLEET_SOAK_REQUIRE_PROGRAM !== "0";
const SUSPEND_GAP_SECS = Math.max(
  0.1,
  Number(process.env.FLEET_SOAK_SUSPEND_GAP_SECS ?? DEFAULT_SUSPEND_GAP_GROWTH_SECS)
);
/** On void (host suspend detected), restart a full run from cycle 0 by default. */
const VOID_RESTART = process.env.FLEET_SOAK_VOID_RESTART !== "0";
const CELLD_TTL_MS = Math.max(1_000, Number(process.env.CELLD_TTL_MS || 10_000));
process.env.CELLD_TTL_MS = String(CELLD_TTL_MS);
const PORT_A = Number(process.env.PROGRAM_CELL_FLEET_PORT_A || 9881);
const PORT_B = Number(process.env.PROGRAM_CELL_FLEET_PORT_B || 9882);
const INTERNAL_A = Number(process.env.PROGRAM_CELL_FLEET_INTERNAL_A || 9883);
const INTERNAL_B = Number(process.env.PROGRAM_CELL_FLEET_INTERNAL_B || 9884);
// Dedicated soak pets port (board boards often pin MOCK_PETS_PORT=9975).
const PETS_PORT = Number(process.env.FLEET_SOAK_PETS_PORT || 9895);
const REGION = process.env.AWS_REGION || "auto";
const FRESH = process.env.FLEET_PHASED_FRESH_NODE_IDS === "1";
const STABLE = {
  A: process.env.FLEET_PHASED_NODE_A?.trim() || "fleet_A",
  B: process.env.FLEET_PHASED_NODE_B?.trim() || "fleet_B",
};
const CELLD_BIN = process.env.CELLD_BIN?.trim() || "celld";
const endpointArgs = process.env.S3_ENDPOINT ? ["--endpoint", process.env.S3_ENDPOINT] : [];
const OUT =
  process.env.FLEET_SOAK_OUT ||
  join(REPO, "docs/benchmarks/program-cell-fleet-kill/node-soak-evidence.json");

if (!process.env.CELLD_BUCKET) {
  console.error("fleet-soak: CELLD_BUCKET required (or CLAWQL_R2_* / CLAWQL_SYNC_* auto-wire)");
  process.exit(2);
}
if (FRESH) {
  console.warn(
    "fleet-soak: FLEET_PHASED_FRESH_NODE_IDS=1 — soak will almost certainly FAIL node ceiling (that is the v3 failure mode)"
  );
}

const bucketUrl = process.env.CELLD_BUCKET.replace(/^s3:\/\//, "");
const slash = bucketUrl.indexOf("/");
const bucketName = slash === -1 ? bucketUrl : bucketUrl.slice(0, slash);
const bucketPrefix = slash === -1 ? "" : bucketUrl.slice(slash + 1).replace(/\/?$/, "/");

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.CLAWQL_SYNC_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.AWS_SECRET_ACCESS_KEY || process.env.CLAWQL_SYNC_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

async function countNodeObjects() {
  const prefix = `${bucketPrefix}nodes/`;
  const keys = [];
  let token;
  do {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const o of out.Contents || []) keys.push(o.Key);
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  const unique = new Set(keys.map((k) => k.slice(prefix.length).split("/")[0]).filter(Boolean));
  return { objectCount: keys.length, uniqueNodeIds: [...unique].sort(), uniqueCount: unique.size };
}

function spawnLogged(cmd, args, logPath, env, cwd) {
  const fd = openSync(logPath, "a");
  return spawn(cmd, args, {
    cwd,
    env,
    stdio: ["ignore", fd, fd],
    detached: false,
  });
}

async function waitUrl(url, pred, opts = {}) {
  const attempts = opts.attempts ?? 120;
  const delayMs = opts.delayMs ?? 250;
  const timeoutMs = opts.timeoutMs ?? 1_500;
  const wallMs = opts.wallMs ?? 45_000;
  const started = Date.now();
  let last;
  for (let i = 0; i < attempts; i++) {
    if (Date.now() - started >= wallMs) {
      throw new Error(`wall timeout ${wallMs}ms waiting for ${url} last=${JSON.stringify(last)}`);
    }
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
    } catch (err) {
      last = { ok: false, error: String(err?.message || err) };
    }
    await sleep(delayMs);
  }
  throw new Error(`waitUrl timeout ${url} last=${JSON.stringify(last)}`);
}

const nodes = {
  A: {
    port: PORT_A,
    internal: INTERNAL_A,
    pid: null,
    log: "/tmp/fleet-soak-a.log",
    wedgeFlag: "/tmp/fleet-soak-wedge-A.flag",
    lastExit: null,
  },
  B: {
    port: PORT_B,
    internal: INTERNAL_B,
    pid: null,
    log: "/tmp/fleet-soak-b.log",
    wedgeFlag: "/tmp/fleet-soak-wedge-B.flag",
    lastExit: null,
  },
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
  try {
    unlinkSync(n.wedgeFlag);
  } catch {
    /* */
  }
  // Wait once per fence exit. Clear the sticky flag after waiting so later
  // startNode calls (every cycle restarts both nodes) do not re-wait TTL, and
  // so cycle scoring does not re-count the same fence forever.
  if (n.lastExit?.selfFence && !n.lastExit?.reuseWaitDone && !FRESH) {
    const waitMs = CELLD_TTL_MS + 500;
    console.warn(
      `fleet-soak: node ${name} self-fenced; waiting ${waitMs}ms before reuse of stable CELLD_NODE=${STABLE[name]}`
    );
    await sleep(waitMs);
    n.lastExit = { ...n.lastExit, reuseWaitDone: true };
  }
  freePortHard(n.port);
  freePortHard(n.internal);
  await waitPortFree(n.port);
  await waitPortFree(n.internal);
  const celldNodeId = FRESH
    ? `fleet_${name}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    : STABLE[name];
  n.nodeId = celldNodeId;
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
      AWS_ACCESS_KEY_ID:
        process.env.AWS_ACCESS_KEY_ID || process.env.CLAWQL_SYNC_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY:
        process.env.AWS_SECRET_ACCESS_KEY || process.env.CLAWQL_SYNC_SECRET_ACCESS_KEY,
      AWS_REGION: REGION,
      AWS_EC2_METADATA_DISABLED: "true",
      CELLD_NODE: celldNodeId,
      CELLD_WEDGE_HEALTH_FLAG: n.wedgeFlag,
      CELLD_TTL_MS: String(CELLD_TTL_MS),
    },
    STREAMS
  );
  n.pid = child.pid;
  child.on("exit", (code, signal) => {
    if (n.pid === child.pid) n.pid = null;
    n.lastExit = { code, signal, selfFence: code === 3, at: new Date().toISOString() };
    if (signal !== "SIGKILL") {
      console.warn(
        `fleet-soak: node ${name} exited code=${code} signal=${signal}${code === 3 ? " SELF-FENCE" : ""}`
      );
    }
  });
}

async function waitReady(name, { requireProgram = REQUIRE_PROGRAM, wallMs = 45_000 } = {}) {
  const base = `http://127.0.0.1:${nodes[name].port}`;
  const healthWall = Math.min(30_000, wallMs);
  try {
    await waitUrl(
      `${base}/.well-known/celld/alive`,
      (r) => r.ok && (r.body?.alive === true || r.body?.ok === true),
      { attempts: 60, timeoutMs: 1_000, wallMs: Math.min(10_000, healthWall) }
    );
  } catch {
    // Stock 0.6.3 has /health only; hung /health is why soak needs deploy+peers.
    await waitUrl(`${base}/health`, (r) => r.ok, {
      attempts: 240,
      timeoutMs: 1_500,
      wallMs: healthWall,
    });
  }
  if (!requireProgram) return;
  await waitUrl(
    `${base}/program/health?cell=health`,
    (r) => r.ok && /ProgramCellDO/.test(JSON.stringify(r.body)),
    { attempts: 180, timeoutMs: 1_500, wallMs }
  );
}

async function deployFleetWorker() {
  freePortHard(PETS_PORT);
  await sleep(300);
  const petsLog = `/tmp/fleet-soak-pets-${PETS_PORT}.log`;
  writeFileSync(petsLog, "");
  const pets = spawnLogged(
    process.execPath,
    [join(STREAMS, "scripts/mock-pets-upstream.mjs"), String(PETS_PORT)],
    petsLog,
    { ...process.env, MOCK_PETS_PORT: String(PETS_PORT) },
    STREAMS
  );
  pets.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`fleet-soak: mock-pets exited early code=${code} signal=${signal}`);
    }
  });
  await waitUrl(
    `http://127.0.0.1:${PETS_PORT}/healthz`,
    (r) => r.ok === true || r.body?.ok === true,
    { attempts: 40, delayMs: 100, timeoutMs: 1_500, wallMs: 10_000 }
  );

  const cfg = join(STREAMS, "wrangler.program-cell-fleet-soak.jsonc");
  const src = readFileSync(join(STREAMS, "wrangler.jsonc"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const wrangler = JSON.parse(src);
  wrangler.vars = wrangler.vars || {};
  wrangler.vars.CLAWQL_CORE_UPSTREAM = `http://127.0.0.1:${PETS_PORT}`;
  wrangler.vars.CLAWQL_MCP_URL = "";
  wrangler.vars.INFERENCE_URL = "";
  writeFileSync(cfg, JSON.stringify(wrangler, null, 2) + "\n");

  console.log("fleet-soak: celld deploy …");
  const deploy = spawn(
    CELLD_BIN,
    ["deploy", cfg, "--bucket", process.env.CELLD_BUCKET, "--region", REGION, ...endpointArgs],
    { cwd: STREAMS, env: process.env, stdio: "inherit" }
  );
  await new Promise((resolve, reject) => {
    deploy.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`celld deploy exited ${code}`))
    );
  });
  return pets;
}

function stopFleet(pets) {
  for (const name of ["A", "B"]) {
    if (nodes[name].pid) {
      try {
        process.kill(nodes[name].pid, "SIGKILL");
      } catch {
        /* */
      }
      nodes[name].pid = null;
    }
  }
  if (pets?.pid) {
    try {
      process.kill(pets.pid, "SIGKILL");
    } catch {
      /* */
    }
  }
}

function writeEvidence(evidence) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `fleet-soak: wrote ${OUT} ok=${evidence.ok} status=${evidence.status} voided=${Boolean(evidence.voided)} cycles=${evidence.cyclesCompleted}`
  );
}

/**
 * One full soak attempt. Never combines with prior partials.
 * @returns {{ voided: boolean, ok: boolean, evidence: object }}
 */
async function runOnce({ attempt = 1 } = {}) {
  writeFileSync(nodes.A.log, "");
  writeFileSync(nodes.B.log, "");
  nodes.A.lastExit = null;
  nodes.B.lastExit = null;

  for (const p of [PORT_A, PORT_B, INTERNAL_A, INTERNAL_B, PETS_PORT]) {
    freePortHard(p);
  }
  await sleep(400);

  const host = captureHostPowerSettings();
  const suspendMon = makeSuspendMonitor({ thresholdSec: SUSPEND_GAP_SECS });
  if (!suspendMon.available) {
    console.warn(
      "fleet-soak: CLOCK_BOOTTIME/MONOTONIC unavailable — cannot enforce host-suspend void rule on this OS"
    );
  } else {
    console.log(
      `fleet-soak: suspend monitor on (void if BOOTTIME−MONOTONIC growth > ${SUSPEND_GAP_SECS}s; baselineGap=${suspendMon.baseline.gapSec.toFixed(3)}s)`
    );
  }

  const pets = await deployFleetWorker();

  const samples = [];
  let selfFences = 0;
  let maxUnique = 0;
  let readyFails = 0;
  let voidInfo = null;

  console.log(
    `fleet-soak: attempt=${attempt} cycles=${CYCLES} minCycles=${MIN_CYCLES} nodeCeiling=${NODE_CEILING} readyRateCeiling=${READY_RATE_CEILING} fenceRateCeiling=${FENCE_RATE_CEILING} fresh=${FRESH} requireProgram=${REQUIRE_PROGRAM} ttl=${CELLD_TTL_MS} bin=${CELLD_BIN} host=${host.hostLabel || host.hostname} bucketPrefix=${bucketPrefix || "(root)"}`
  );
  console.log(
    FRESH
      ? "fleet-soak: CELLD_NODE=fresh-every-start"
      : `fleet-soak: CELLD_NODE=stable (${STABLE.A}, ${STABLE.B})`
  );

  await startNode("A");
  await startNode("B");
  await sleep(2000);
  await waitReady("A", { requireProgram: REQUIRE_PROGRAM, wallMs: 60_000 });
  await waitReady("B", { requireProgram: REQUIRE_PROGRAM, wallMs: 60_000 });
  console.log("fleet-soak: initial fleet ready");

  const checkSuspend = (where) => {
    const s = suspendMon.sample();
    if (s.voided) {
      voidInfo = { ...s, where, atCycle: samples.length };
      console.error(
        `fleet-soak: VOID host suspend detected at ${where} (growthSec=${s.growthSec?.toFixed?.(3)} > ${SUSPEND_GAP_SECS}); run discarded — not a software fail`
      );
      return true;
    }
    return false;
  };

  for (let c = 0; c < CYCLES; c++) {
    if (checkSuspend(`pre_cycle_${c + 1}`)) break;

    const victim = c % 2 === 0 ? "A" : "B";
    if (nodes[victim].pid) {
      try {
        process.kill(nodes[victim].pid, "SIGKILL");
      } catch {
        /* */
      }
      nodes[victim].pid = null;
    }
    await sleep(500);
    await startNode("A");
    await startNode("B");
    await sleep(1500);
    try {
      // After rebuild, /health alone proves the process is fleet-ready; program
      // probe is optional (default on) but must not burn unbounded wall time.
      await waitReady("A", { requireProgram: REQUIRE_PROGRAM, wallMs: 45_000 });
      await waitReady("B", { requireProgram: REQUIRE_PROGRAM, wallMs: 45_000 });
    } catch (err) {
      readyFails += 1;
      console.warn(`fleet-soak: cycle ${c + 1} waitReady failed (${err.message}); continue`);
    }
    for (const name of ["A", "B"]) {
      const ex = nodes[name].lastExit;
      // Count each fence exit once (not every subsequent cycle while lastExit sticks).
      if (ex?.selfFence && !ex?.counted) {
        selfFences += 1;
        nodes[name].lastExit = { ...ex, counted: true };
      }
    }
    const snap = await countNodeObjects();
    maxUnique = Math.max(maxUnique, snap.uniqueCount);
    samples.push({
      cycle: c + 1,
      at: new Date().toISOString(),
      ...snap,
      selfFencesSoFar: selfFences,
      readyFailsSoFar: readyFails,
    });
    console.log(
      `fleet-soak: ${c + 1}/${CYCLES} uniqueNodes=${snap.uniqueCount} objects=${snap.objectCount} selfFences=${selfFences} readyFails=${readyFails} ids=${snap.uniqueNodeIds.join(",")}`
    );

    if (checkSuspend(`post_cycle_${c + 1}`)) break;

    if (snap.uniqueCount > NODE_CEILING) {
      break;
    }
    await sleep(SLEEP_MS);
  }

  stopFleet(pets);

  const cyclesCompleted = samples.length;
  const labBin =
    typeof CELLD_BIN === "string" && /vendor\/celld-lab\//.test(CELLD_BIN);
  const celldBuild = labBin
    ? "lab_fixed_alive_sweep_supersede"
    : process.env.FLEET_SOAK_CELLD_BUILD || "stock_or_unknown";

  if (voidInfo) {
    const voidPath = OUT.replace(/\.json$/i, "") + `-void-attempt${attempt}.json`;
    const evidence = {
      kind: "celld-fleet-node-soak",
      role: "void_host_suspend",
      authorizing: false,
      voided: true,
      ok: false,
      v4SoakOk: false,
      status: "void_host_suspend",
      honesty:
        "VOID — host suspend/pause detected via CLOCK_BOOTTIME−CLOCK_MONOTONIC gap growth. Infrastructure event, not a software result. This run is recorded but not counted; partial cycles are never combined with a later attempt. Authorizing soak requires ≥minCycles consecutive cycles in one non-void run.",
      attempt,
      celldBuild,
      celldBin: CELLD_BIN,
      host,
      suspendMonitor: {
        thresholdSec: SUSPEND_GAP_SECS,
        baseline: suspendMon.baseline,
        void: voidInfo,
      },
      measuredAt: new Date().toISOString(),
      cyclesPlanned: CYCLES,
      cyclesCompleted,
      cyclesBeforeVoid: voidInfo.atCycle,
      minCycles: MIN_CYCLES,
      selfFences,
      readyFails,
      maxUniqueNodeIds: maxUnique,
      celldTtlMs: CELLD_TTL_MS,
      samples,
      bucketRedacted: true,
    };
    writeEvidence(evidence);
    // Also keep a durable void artifact beside the main OUT path.
    if (voidPath !== OUT) {
      writeFileSync(voidPath, `${JSON.stringify(evidence, null, 2)}\n`);
      console.log(`fleet-soak: void artifact ${voidPath}`);
    }
    return { voided: true, ok: false, evidence };
  }

  const readyRate = cyclesCompleted ? readyFails / cyclesCompleted : 1;
  const fenceRate = cyclesCompleted ? selfFences / cyclesCompleted : 1;
  const readyRateUb95 = wilsonUpper95(readyFails, cyclesCompleted);
  const fenceRateUb95 = wilsonUpper95(selfFences, cyclesCompleted);
  const readyRuleOfThree =
    readyFails === 0 ? ruleOfThreeUpper95(0, cyclesCompleted) : null;
  const fenceRuleOfThree =
    selfFences === 0 ? ruleOfThreeUpper95(0, cyclesCompleted) : null;
  const nodeCeilingOk = maxUnique <= NODE_CEILING && !FRESH;
  const minCyclesOk = cyclesCompleted >= MIN_CYCLES;
  const readyRateOk =
    readyRate <= READY_RATE_CEILING && readyRateUb95 <= READY_RATE_CEILING;
  const fenceRateOk =
    fenceRate <= FENCE_RATE_CEILING && fenceRateUb95 <= FENCE_RATE_CEILING;
  /** All gates — sample size + rates with UBs under v4 headroom. */
  const v4SoakOk = nodeCeilingOk && minCyclesOk && readyRateOk && fenceRateOk;
  const ok = v4SoakOk;
  const status = !nodeCeilingOk
    ? "failed_node_ceiling"
    : !minCyclesOk
      ? "failed_min_cycles"
      : !readyRateOk || !fenceRateOk
        ? "failed_v4_rate_gates"
        : "measured_v4_ready";
  const authorizing = Boolean(v4SoakOk && labBin);
  const evidence = {
    kind: "celld-fleet-node-soak",
    role: authorizing
      ? "authorizing_fixed_lab"
      : labBin
        ? "lab_fixed_not_yet_authorizing"
        : "non_lab_or_unfixed",
    authorizing,
    voided: false,
    celldBuild,
    celldBin: CELLD_BIN,
    host,
    suspendMonitor: {
      thresholdSec: SUSPEND_GAP_SECS,
      baseline: suspendMon.baseline,
      final: suspendMon.sample(),
    },
    measuredAt: new Date().toISOString(),
    ok,
    v4SoakOk,
    nodeCeilingOk,
    minCyclesOk,
    readyRateOk,
    fenceRateOk,
    status: authorizing ? "measured_v4_ready" : status,
    honesty: labBin
      ? "Lab binary soak (alive≠ready + lease-sweep + same-host supersede). Authorizes v4 only when status=measured_v4_ready (cycles≥minCycles, 0 readyFails, 0 selfFences, nodes≤2) on a non-void run. A soak only covers the binary it measured. Host suspend voids the run (BOOTTIME−MONOTONIC)."
      : "Pre-v4 soak. Pass requires nodes≤ceiling, cycles≥minCycles (default 1000), and for readyFails/selfFences both observed rate and Wilson 95% UB ≤0.5% (strict — at n=1000 that means 0 events/gate; 1 event ≈0.56% fails). Not relaxed to ~1% UB. Product: stable id + same-host incarnation supersede (pid+startTime+bootId; cross-host wait/refuse) + lease-sweep + alive≠ready. Host suspend voids the run. Do not start v4 until status=measured_v4_ready on the fixed lab/build. Stock/unfixed soaks are baseline only.",
    attempt,
    cyclesPlanned: CYCLES,
    cyclesCompleted,
    minCycles: MIN_CYCLES,
    nodeCeiling: NODE_CEILING,
    readyRateCeiling: READY_RATE_CEILING,
    fenceRateCeiling: FENCE_RATE_CEILING,
    readyRate,
    readyRateUb95,
    readyRuleOfThreeUpper95: readyRuleOfThree,
    fenceRate,
    fenceRateUb95,
    fenceRuleOfThreeUpper95: fenceRuleOfThree,
    freshNodeIds: FRESH,
    stableNodeIds: FRESH ? null : STABLE,
    celldTtlMs: CELLD_TTL_MS,
    requireProgram: REQUIRE_PROGRAM,
    maxUniqueNodeIds: maxUnique,
    selfFences,
    readyFails,
    samples,
    bucketRedacted: true,
  };
  writeEvidence(evidence);
  return { voided: false, ok, evidence };
}

async function main() {
  mkdirSync(dirname(OUT), { recursive: true });
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const result = await runOnce({ attempt });
    if (!result.voided) {
      process.exit(result.ok ? 0 : 1);
    }
    if (!VOID_RESTART) {
      console.error("fleet-soak: voided; FLEET_SOAK_VOID_RESTART=0 so exiting 75");
      process.exit(75);
    }
    console.warn(
      `fleet-soak: voided attempt ${attempt}; restarting from cycle 0 (partial cycles discarded, never combined)`
    );
    await sleep(2_000);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
