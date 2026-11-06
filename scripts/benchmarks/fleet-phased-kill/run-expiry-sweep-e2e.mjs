#!/usr/bin/env node
/**
 * Real-binary e2e: SIGSTOP past lease expiry → maintenance sweep → SIGCONT.
 *
 * Recipe (EXPIRY_NOT_DEAD.md):
 *   1. Start write; wait until intent is visible (after_intent_before_call pause)
 *   2. SIGSTOP the owner (alive, cannot renew)
 *   3. Wait past TTL + ≥1 log-maintenance tick (sweep)
 *   4. SIGCONT
 *   5. SIGKILL owner; resume on survivor; assert intent present
 *
 * Paired evidence: run once with pre-fix CELLD_BIN (expect lost intent /
 * eager-recovery lines) and once with fixed CELLD_BIN (expect intent kept /
 * "not abandoned" skip lines).
 *
 * Env:
 *   CELLD_BIN                          lab celld under test (required)
 *   CELLD_BUCKET / R2 creds            required
 *   CELLD_TTL_MS                       default 3000
 *   CELLD_LOG_MAINTENANCE_TICK_MS      default 2000 (lab override; min 1000)
 *   FLEET_EXPIRY_E2E_OUT               evidence JSON path
 *   FLEET_EXPIRY_E2E_LABEL             e.g. pre_fix | post_fix
 *   FLEET_EXPIRY_E2E_EXPECT_LOST       1 = expect lost_midflight_intent (pre-fix)
 *   FLEET_EXPIRY_E2E_EXPECT_KEPT       1 = expect intent preserved (post-fix)
 *   PROGRAM_CELL_FLEET_PORT_* / MOCK_PETS_PORT — alternate ports if needed
 */
import { spawn, execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  openSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const STREAMS = join(REPO, "docs/examples/streams-celld");

const CELLD_BIN = process.env.CELLD_BIN?.trim();
if (!CELLD_BIN || !existsSync(CELLD_BIN)) {
  console.error("run-expiry-sweep-e2e: CELLD_BIN must point at an existing lab celld");
  process.exit(2);
}
// Prefer the absolute binary under test — do not rely on PATH/`celld` name.
const CELLD_CMD = CELLD_BIN;

const CELLD_TTL_MS = Math.max(1_000, Number(process.env.CELLD_TTL_MS || 3_000));
process.env.CELLD_TTL_MS = String(CELLD_TTL_MS);
const MAINT_TICK_MS = Math.max(
  1_000,
  Number(process.env.CELLD_LOG_MAINTENANCE_TICK_MS || 2_000)
);
process.env.CELLD_LOG_MAINTENANCE_TICK_MS = String(MAINT_TICK_MS);

const PORT_A = Number(process.env.PROGRAM_CELL_FLEET_PORT_A || 9881);
const PORT_B = Number(process.env.PROGRAM_CELL_FLEET_PORT_B || 9882);
const INTERNAL_A = Number(process.env.PROGRAM_CELL_FLEET_INTERNAL_A || 9883);
const INTERNAL_B = Number(process.env.PROGRAM_CELL_FLEET_INTERNAL_B || 9884);
const PETS_PORT = Number(process.env.MOCK_PETS_PORT || 9885);
const LABEL = process.env.FLEET_EXPIRY_E2E_LABEL || "unlabeled";
const OUT =
  process.env.FLEET_EXPIRY_E2E_OUT ||
  join(REPO, "docs/benchmarks/program-cell-fleet-kill/expiry-sweep-e2e.json");
const EXPECT_LOST = process.env.FLEET_EXPIRY_E2E_EXPECT_LOST === "1";
const EXPECT_KEPT = process.env.FLEET_EXPIRY_E2E_EXPECT_KEPT === "1";

const logNs = `expirye2e-${PORT_A}`;
const logs = {
  a: `/tmp/fleet-phased-${logNs}-a.log`,
  b: `/tmp/fleet-phased-${logNs}-b.log`,
  pets: `/tmp/fleet-phased-pets-${PETS_PORT}.log`,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, init = {}, timeoutMs = 5_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

async function waitUrl(url, pred, { wallMs = 45_000, delayMs = 250 } = {}) {
  const start = Date.now();
  while (Date.now() - start < wallMs) {
    const r = await fetchJson(url, {}, 2_000);
    if (pred(r)) return r;
    await sleep(delayMs);
  }
  throw new Error(`timeout waiting for ${url}`);
}

function spawnLogged(cmd, args, logPath, env) {
  mkdirSync(dirname(logPath), { recursive: true });
  const fd = openSync(logPath, "a");
  writeFileSync(
    logPath,
    `\n----- restart ${new Date().toISOString()} ${cmd} ${args.join(" ")} -----\n`,
    { flag: "a" }
  );
  return spawn(cmd, args, {
    cwd: STREAMS,
    env,
    stdio: ["ignore", fd, fd],
  });
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function procExe(pid) {
  try {
    return execFileSync("readlink", ["-f", `/proc/${pid}/exe`], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function procState(pid) {
  try {
    const st = readFileSync(`/proc/${pid}/status`, "utf8");
    const m = st.match(/^State:\s+(\S+)/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function countLog(pat) {
  let n = 0;
  for (const p of [logs.a, logs.b]) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    const re = typeof pat === "string" ? new RegExp(pat, "g") : pat;
    const m = text.match(re);
    if (m) n += m.length;
  }
  return n;
}

function killPort(port) {
  try {
    execFileSync("bash", ["-lc", `fuser -k ${port}/tcp 2>/dev/null || true`], {
      stdio: "ignore",
    });
  } catch {
    /* */
  }
}

async function main() {
  if (!process.env.CELLD_BUCKET) {
    console.error("run-expiry-sweep-e2e: CELLD_BUCKET required");
    process.exit(2);
  }
  console.log(
    `expiry-sweep-e2e: label=${LABEL} bin=${CELLD_BIN} ttl=${CELLD_TTL_MS} maintTick=${MAINT_TICK_MS}`
  );
  console.log(`expiry-sweep-e2e: sha256=${sha256File(CELLD_BIN)}`);

  for (const p of [PORT_A, PORT_B, INTERNAL_A, INTERNAL_B, PETS_PORT]) killPort(p);
  await sleep(500);
  for (const p of Object.values(logs)) {
    try {
      unlinkSync(p);
    } catch {
      /* */
    }
  }

  const pets = spawnLogged(
    process.execPath,
    [join(STREAMS, "scripts/mock-pets-upstream.mjs"), String(PETS_PORT)],
    logs.pets,
    process.env
  );
  await waitUrl(`http://127.0.0.1:${PETS_PORT}/healthz`, (r) => r.ok);

  // Same deploy shape as run-board.mjs: parse wrangler.jsonc, write fleet cfg
  // under STREAMS so worker.js resolves relative to cwd.
  const cfg = join(STREAMS, "wrangler.program-cell-fleet-phased.jsonc");
  const src = readFileSync(join(STREAMS, "wrangler.jsonc"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const wrangler = JSON.parse(src);
  wrangler.vars = wrangler.vars || {};
  wrangler.vars.CLAWQL_CORE_UPSTREAM = `http://127.0.0.1:${PETS_PORT}`;
  wrangler.vars.CLAWQL_MCP_URL = "";
  wrangler.vars.INFERENCE_URL = "";
  writeFileSync(cfg, JSON.stringify(wrangler, null, 2) + "\n");
  const endpoint = process.env.S3_ENDPOINT;
  const deployArgs = [
    "deploy",
    cfg,
    "--bucket",
    process.env.CELLD_BUCKET,
    "--region",
    process.env.AWS_REGION || "auto",
  ];
  if (endpoint) deployArgs.push("--endpoint", endpoint);
  const deploy = spawn(CELLD_CMD, deployArgs, {
    cwd: STREAMS,
    env: process.env,
    stdio: "inherit",
  });
  await new Promise((resolve, reject) => {
    deploy.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`deploy ${code}`))
    );
  });

  const nodes = {
    A: {
      port: PORT_A,
      internal: INTERNAL_A,
      nodeId: "fleet_A",
      pid: null,
      log: logs.a,
      wedgeFlag: `/tmp/fleet-phased-wedge-${logNs}-A.flag`,
    },
    B: {
      port: PORT_B,
      internal: INTERNAL_B,
      nodeId: "fleet_B",
      pid: null,
      log: logs.b,
      wedgeFlag: `/tmp/fleet-phased-wedge-${logNs}-B.flag`,
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
      await sleep(300);
    }
    try {
      unlinkSync(n.wedgeFlag);
    } catch {
      /* */
    }
    killPort(n.port);
    killPort(n.internal);
    await sleep(200);
    const args = [
      "--bucket",
      process.env.CELLD_BUCKET,
      "--region",
      process.env.AWS_REGION || "auto",
      "--listen",
      `127.0.0.1:${n.port}`,
      "--internal-listen",
      `127.0.0.1:${n.internal}`,
      "--advertise",
      `127.0.0.1:${n.internal}`,
    ];
    if (endpoint) args.push("--endpoint", endpoint);
    const env = {
      ...process.env,
      CELLD_NODE: n.nodeId,
      CELLD_WEDGE_HEALTH_FLAG: n.wedgeFlag,
      CELLD_TTL_MS: String(CELLD_TTL_MS),
      CELLD_LOG_MAINTENANCE_TICK_MS: String(MAINT_TICK_MS),
      RUST_LOG: process.env.RUST_LOG || "info",
    };
    const child = spawnLogged(CELLD_CMD, args, n.log, env);
    n.pid = child.pid;
    n.child = child;
    child.on("exit", (code, signal) => {
      console.warn(
        `expiry-sweep-e2e: node ${name} exited code=${code} signal=${signal} pidWas=${child.pid}`
      );
      if (n.pid === child.pid) n.pid = null;
    });
    await waitUrl(`http://127.0.0.1:${n.port}/health`, (r) => r.ok, {
      wallMs: 60_000,
    });
    await waitUrl(
      `http://127.0.0.1:${n.port}/program/health?cell=health`,
      (r) => r.ok,
      { wallMs: 60_000 }
    );
  }

  await startNode("A");
  await startNode("B");
  console.log("expiry-sweep-e2e: both nodes ready");

  const programId = `expiry_sweep_${LABEL}_${Date.now()}`;
  const victim = "A";
  const survivor = "B";
  const baseV = `http://127.0.0.1:${nodes[victim].port}`;
  const baseS = `http://127.0.0.1:${nodes[survivor].port}`;

  await fetchJson(`http://127.0.0.1:${PETS_PORT}/__reset`, { method: "POST" });

  const body = {
    programId,
    plan: {
      calls: [
        { operationId: "listPets", method: "GET", path: "/pets", risk: "read" },
        { operationId: "streams.session.noop", risk: "read" },
        {
          operationId: "owners.create",
          method: "POST",
          path: "/owners",
          risk: "write",
          args: { name: programId, idempotencyKey: programId },
        },
      ],
    },
    pauseAfterIntentIndex: 2,
  };

  const ac = new AbortController();
  const runPromise = fetch(`${baseV}/program/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: ac.signal,
  }).catch(() => null);

  // 1. Wait for intent on victim
  const intentDeadline = Date.now() + 15_000;
  let intentBeforeFreeze = false;
  let statusBefore = null;
  while (Date.now() < intentDeadline) {
    const st = await fetchJson(
      `${baseV}/program/status?programId=${encodeURIComponent(programId)}`,
      {},
      2_000
    );
    const intents = Array.isArray(st.body?.intents) ? st.body.intents : [];
    const pauseKind = st.body?.meta?.pauseKind || null;
    if (intents.length > 0 || pauseKind === "after_intent_before_call") {
      intentBeforeFreeze = true;
      statusBefore = st.body;
      break;
    }
    await sleep(100);
  }
  if (!intentBeforeFreeze) {
    console.error("expiry-sweep-e2e: FAIL — intent never visible before freeze");
    process.exit(1);
  }
  console.log("expiry-sweep-e2e: intent visible; SIGSTOP owner");

  const victimPid = nodes[victim].pid;
  const victimExe = procExe(victimPid);
  const expectedSha = sha256File(CELLD_BIN);
  if (!victimExe || victimExe !== CELLD_CMD) {
    console.error(
      `expiry-sweep-e2e: FAIL — victim exe mismatch: pid=${victimPid} exe=${victimExe} expected=${CELLD_CMD}`
    );
    process.exit(2);
  }
  console.log(
    `expiry-sweep-e2e: victim pid=${victimPid} exe=${victimExe} sha256=${expectedSha}`
  );

  // 2. Freeze owner
  writeFileSync(nodes[victim].wedgeFlag, `wedge ${Date.now()}\n`);
  const frozeAt = Date.now();
  process.kill(victimPid, "SIGSTOP");
  await sleep(100);
  const stateRightAfterStop = procState(victimPid);
  if (stateRightAfterStop !== "T") {
    console.error(
      `expiry-sweep-e2e: FAIL — owner not stopped after SIGSTOP (state=${stateRightAfterStop})`
    );
    process.exit(2);
  }

  // 3. Wait past TTL + ≥2 maintenance ticks; poke survivor so fleet stays active.
  // Hold long enough that B's dead-leader sweep must have run while A is still T.
  const holdMs = CELLD_TTL_MS + MAINT_TICK_MS * 3 + 2_000;
  const holdUntil = Date.now() + holdMs;
  console.log(`expiry-sweep-e2e: holding freeze ${holdMs}ms for expiry+sweep`);
  let ownerAliveStoppedSamples = 0;
  let ownerNotStoppedSamples = 0;
  let statusDuringFreeze = null;
  while (Date.now() < holdUntil) {
    const st = procState(victimPid);
    if (st === "T") ownerAliveStoppedSamples += 1;
    else ownerNotStoppedSamples += 1;
    await fetchJson(
      `${baseS}/program/status?programId=${encodeURIComponent(programId)}`,
      {},
      2_000
    );
    await fetchJson(`${baseS}/program/health?cell=health`, {}, 2_000);
    await sleep(400);
  }
  if (ownerNotStoppedSamples > 0 || ownerAliveStoppedSamples === 0) {
    console.error(
      `expiry-sweep-e2e: FAIL — owner left stopped state during hold (T=${ownerAliveStoppedSamples} other=${ownerNotStoppedSamples} last=${procState(victimPid)})`
    );
    process.exit(2);
  }

  const eagerRecovery = countLog(/eager recovery: dead session with an open log/g);
  const skipAbandoned = countLog(
    /lease fenceable \(expiry\) but owner not abandoned|skipping open-log recovery/g
  );
  console.log(
    `expiry-sweep-e2e: during freeze eagerRecovery=${eagerRecovery} skipAbandoned=${skipAbandoned} stoppedSamples=${ownerAliveStoppedSamples}`
  );

  // Snapshot status on survivor WHILE owner is still frozen (isolates expiry
  // sweep from process-death / self-fence on thaw).
  {
    const st = await fetchJson(
      `${baseS}/program/status?programId=${encodeURIComponent(programId)}`,
      {},
      5_000
    );
    statusDuringFreeze = st.ok ? st.body : { _fetch: st };
  }

  // 4. Thaw — owner may self-fence (watchdog code=3) once it wakes past TTL.
  try {
    process.kill(victimPid, "SIGCONT");
  } catch {
    /* */
  }
  try {
    unlinkSync(nodes[victim].wedgeFlag);
  } catch {
    /* */
  }
  await sleep(500);
  console.log("expiry-sweep-e2e: SIGCONT owner");

  const statusAfterThaw = await fetchJson(
    `${baseV}/program/status?programId=${encodeURIComponent(programId)}`,
    {},
    3_000
  );

  // 5. Kill owner; resume on survivor
  try {
    ac.abort();
  } catch {
    /* */
  }
  try {
    process.kill(victimPid, "SIGKILL");
  } catch {
    /* */
  }
  nodes[victim].pid = null;
  await sleep(500);
  await startNode(victim); // rebuild peer so fleet is dual again
  const resumeDeadline = Date.now() + 60_000;
  let statusAfter = null;
  let hasIntent = false;
  let pauseKind = null;
  while (Date.now() < resumeDeadline) {
    const st = await fetchJson(
      `${baseS}/program/status?programId=${encodeURIComponent(programId)}`,
      {},
      3_000
    );
    if (st.ok && st.body) {
      statusAfter = st.body;
      const intents = Array.isArray(st.body.intents) ? st.body.intents : [];
      pauseKind = st.body?.meta?.pauseKind || null;
      hasIntent =
        intents.length > 0 ||
        pauseKind === "after_intent_before_call" ||
        pauseKind === "during_call";
      if (hasIntent || st.body?.outcome === "outcome_unknown") break;
    }
    await fetchJson(
      `${baseS}/program/run`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programId, resume: true }),
      },
      5_000
    ).catch(() => null);
    await sleep(500);
  }

  const intentsDuringFreeze = Array.isArray(statusDuringFreeze?.intents)
    ? statusDuringFreeze.intents.length
    : 0;
  const pauseDuringFreeze = statusDuringFreeze?.meta?.pauseKind || null;
  const hasIntentDuringFreeze =
    intentsDuringFreeze > 0 ||
    pauseDuringFreeze === "after_intent_before_call" ||
    pauseDuringFreeze === "during_call";

  const lostIntent = intentBeforeFreeze && !hasIntent;
  // Sweep differential (paired evidence independent of program-intent loss):
  // pre-fix must eager-recover open log while owner is still T; post-fix must
  // skip abandonment for the same recipe.
  const sweepFiredWhileLive = eagerRecovery > 0;
  const sweepSkippedWhileLive = skipAbandoned > 0;
  let verdict;
  if (EXPECT_LOST) {
    if (lostIntent && sweepFiredWhileLive) {
      verdict = "pre_fix_lost_intent_via_expiry_sweep";
    } else if (!lostIntent && sweepFiredWhileLive) {
      verdict = "pre_fix_sweep_fired_intent_kept";
    } else if (!lostIntent && !sweepFiredWhileLive) {
      verdict = "pre_fix_no_sweep_intent_kept";
    } else {
      verdict = "pre_fix_lost_intent_without_eager_sweep";
    }
  } else if (EXPECT_KEPT) {
    verdict =
      !lostIntent && sweepSkippedWhileLive && !sweepFiredWhileLive
        ? "post_fix_skip_abandon_intent_kept"
        : lostIntent
          ? "post_fix_lost_intent"
          : "post_fix_unexpected_sweep_shape";
  } else {
    verdict = lostIntent ? "lost_intent" : "intent_kept";
  }
  // ok: paired sweep shape must match expectation; program-intent EXPECT_LOST
  // is reported honestly (false when sweep fires but intent survives).
  const sweepShapeOk = EXPECT_LOST
    ? sweepFiredWhileLive
    : EXPECT_KEPT
      ? sweepSkippedWhileLive && !sweepFiredWhileLive
      : true;
  const intentOk = EXPECT_LOST ? lostIntent : EXPECT_KEPT ? !lostIntent : !lostIntent;
  const evidence = {
    status: "measured",
    label: LABEL,
    verdict,
    ok: sweepShapeOk && intentOk,
    sweepShapeOk,
    intentOk,
    celldBin: CELLD_BIN,
    celldSha256: expectedSha,
    victimExe,
    victimPid,
    celldTtlMs: CELLD_TTL_MS,
    maintenanceTickMs: MAINT_TICK_MS,
    holdMs,
    frozeAt: new Date(frozeAt).toISOString(),
    programId,
    intentBeforeFreeze,
    hasIntentDuringFreeze,
    hasIntentAfterResume: hasIntent,
    lostMidflightIntent: lostIntent,
    pauseKindDuringFreeze: pauseDuringFreeze,
    pauseKindAfter: pauseKind,
    ownerAliveStoppedSamples,
    ownerNotStoppedSamples,
    eagerRecoveryLines: eagerRecovery,
    skipAbandonedLines: skipAbandoned,
    sweepFiredWhileLive,
    sweepSkippedWhileLive,
    expectLost: EXPECT_LOST,
    expectKept: EXPECT_KEPT,
    statusBefore,
    statusDuringFreeze,
    statusAfterThawOk: statusAfterThaw.ok,
    statusAfter,
    measuredAt: new Date().toISOString(),
    recipe:
      "intent visible → SIGSTOP (confirm T) past TTL+maint tick → status while frozen → SIGCONT → SIGKILL → survivor status",
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(evidence, null, 2) + "\n");
  console.log(`wrote ${OUT}`);
  console.log(
    `expiry-sweep-e2e: verdict=${verdict} lostIntent=${lostIntent} hasIntent=${hasIntent} eager=${eagerRecovery} skip=${skipAbandoned} sweepShapeOk=${sweepShapeOk} intentOk=${intentOk} ok=${evidence.ok}`
  );

  // teardown
  for (const name of ["A", "B"]) {
    if (nodes[name].pid) {
      try {
        process.kill(nodes[name].pid, "SIGKILL");
      } catch {
        /* */
      }
    }
  }
  try {
    process.kill(pets.pid, "SIGKILL");
  } catch {
    /* */
  }

  if (EXPECT_LOST && !lostIntent) {
    console.error(
      `expiry-sweep-e2e: EXPECT_LOST=1 but intent preserved (verdict=${verdict}). ` +
        (sweepFiredWhileLive
          ? "Eager open-log recovery fired while owner was SIGSTOP'd, but ProgramCell intent survived — TTL3s 2/100 has another cause."
          : "Eager recovery did not fire; recipe did not exercise expiry-as-dead sweep.")
    );
    // Exit 3 = sweep differential observed, program-intent loss NOT reproduced.
    // Exit 1 = expectation miss without useful sweep signal.
    process.exit(sweepFiredWhileLive ? 3 : 1);
  }
  if (EXPECT_KEPT && lostIntent) {
    console.error("expiry-sweep-e2e: EXPECT_KEPT=1 but intent was lost — fix failed");
    process.exit(1);
  }
  if (EXPECT_KEPT && !sweepShapeOk) {
    console.error(
      `expiry-sweep-e2e: EXPECT_KEPT=1 but sweep shape wrong (eager=${eagerRecovery} skip=${skipAbandoned})`
    );
    process.exit(1);
  }
  if (!EXPECT_LOST && !EXPECT_KEPT && lostIntent) {
    process.exit(1);
  }
  process.exit(evidence.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("expiry-sweep-e2e:", err);
  process.exit(1);
});
