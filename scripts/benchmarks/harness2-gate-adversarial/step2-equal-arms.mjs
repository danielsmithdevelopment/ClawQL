#!/usr/bin/env node
/**
 * Harness² × ClawQL — step 2 equal-arm JobBench orchestrator.
 *
 * Arms identical except gateway:
 *   - passthrough: upstream OpenCode tool surface (no ClawQL choke)
 *   - clawql: same substrate with ClawQL MCP + frozen park/IFC env
 *
 * Requires (for a live scored run):
 *   HARNESS2_ROOT          path to google-research/harness2 checkout (jb installed)
 *   HARNESS2_SOLVER_MODEL  OpenCode provider/model id (see upstream SETUP.md)
 *   GOOGLE_CLOUD_PROJECT or HARNESS2_JUDGE_BASE_URL (+ judge key/model)
 *
 * Flags:
 *   --dry-run   Probe deps/credentials; write blocked status artifact; never claim scores.
 *   --run       Attempt live equal-arm harness2 + judge + report (fails if creds missing).
 *
 * Default is --dry-run so CI / agents cannot invent a publishable scoreboard.
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const OUT_DIR = join(ROOT, "docs/benchmarks/harness2-gate-adversarial");
const ARTIFACTS = join(OUT_DIR, "artifacts");

const FROZEN = {
  bench: "jb",
  mode: "sequential",
  k: 2,
  substrate: "oc",
};

const args = new Set(process.argv.slice(2));
const DRY = !args.has("--run");
const FORCE_RUN = args.has("--run");

function sh(cmd, opts = {}) {
  return spawnSync(cmd[0], cmd.slice(1), {
    encoding: "utf8",
    env: { ...process.env, ...(opts.env || {}) },
    cwd: opts.cwd,
  });
}

function which(bin, env = process.env) {
  const r = spawnSync("bash", ["-lc", `command -v ${bin}`], {
    encoding: "utf8",
    env,
  });
  return r.status === 0 ? r.stdout.trim() : "";
}

function missingCreds() {
  const missing = [];
  if (!process.env.HARNESS2_SOLVER_MODEL?.trim()) {
    missing.push("HARNESS2_SOLVER_MODEL");
  }
  const hasVertex = Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim());
  const hasJudgeUrl = Boolean(process.env.HARNESS2_JUDGE_BASE_URL?.trim());
  if (!hasVertex && !hasJudgeUrl) {
    missing.push("GOOGLE_CLOUD_PROJECT|HARNESS2_JUDGE_BASE_URL");
  }
  if (!process.env.HARNESS2_JUDGE_MODEL?.trim()) {
    missing.push("HARNESS2_JUDGE_MODEL");
  }
  if (hasJudgeUrl && !hasVertex && !process.env.HARNESS2_JUDGE_API_KEY?.trim()) {
    missing.push("HARNESS2_JUDGE_API_KEY");
  }
  return missing;
}

function probeHarnessRoot(root) {
  const issues = [];
  if (!existsSync(root)) {
    issues.push(`HARNESS2_ROOT missing: ${root}`);
    return issues;
  }
  const jb = join(root, "dependencies/job-bench-eval");
  if (!existsSync(jb)) {
    issues.push("job-bench-eval not installed (run: harness2-setup jb)");
  }
  const dataset = join(jb, "dataset/main");
  if (!existsSync(dataset)) {
    issues.push("JobBench dataset/main missing after setup");
  }
  return issues;
}

function readJbRevision(root) {
  const candidates = [
    join(root, "dependencies/job-bench-eval/dataset/main/revision.json"),
    join(root, "dependencies/job-bench-eval/dataset/revision.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      /* ignore */
    }
  }
  // search download-* dirs
  const ds = join(root, "dependencies/job-bench-eval/dataset");
  if (!existsSync(ds)) return null;
  try {
    for (const name of readdirSync(ds)) {
      const p = join(ds, name, "revision.json");
      if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeAtomic(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  renameSync(tmp, path);
}

function clawqlEnvFrozen() {
  return {
    // Session IFC default-on when unset; pin explicitly for the arm.
    CLAWQL_SESSION_IFC: process.env.CLAWQL_SESSION_IFC ?? "1",
    CLAWQL_PARK_DESTRUCTIVE_WRITES: process.env.CLAWQL_PARK_DESTRUCTIVE_WRITES ?? "1",
  };
}

function buildOpencodeMcpOverlay({ arm, mcpUrl }) {
  if (arm === "passthrough") {
    return {
      arm,
      note: "No ClawQL MCP — upstream OpenCode tool surface only",
      mcp: {},
    };
  }
  return {
    arm,
    note: "ClawQL MCP as external tool layer; policy frozen in process env",
    mcp: {
      clawql: {
        type: "remote",
        url: mcpUrl,
        enabled: true,
      },
    },
    env: clawqlEnvFrozen(),
  };
}

function main() {
  const harnessRoot = process.env.HARNESS2_ROOT?.trim()
    ? resolve(process.env.HARNESS2_ROOT.trim())
    : "";

  const status = {
    kind: "harness2_gate_adversarial_step2",
    generatedAt: new Date().toISOString(),
    step: 2,
    upstream_harness2: true,
    stand_in_optimizer: false,
    frozen: FROZEN,
    mode: DRY ? "dry_run" : "live",
    honesty: [
      "Step 2 requires real upstream Harness² + JobBench scorers — not step-1 stand-in numbers.",
      "Equal arms differ only by ClawQL MCP gateway (park/IFC frozen in env).",
      "Do not publish unless passthrough shows effectuated evasions + poison and ClawQL shows neither with matching JobBench scores.",
    ],
    arms: {
      passthrough: { gateway: "none" },
      clawql: { gateway: "clawql_mcp", env: clawqlEnvFrozen() },
    },
  };

  if (!harnessRoot) {
    status.status = "blocked";
    status.blocker = "HARNESS2_ROOT unset";
    status.next =
      "Clone google-research/harness2, harness2-setup jb, export HARNESS2_ROOT, set solver/judge credentials, re-run with --run";
    const out = join(OUT_DIR, "results-step2-blocked.json");
    writeAtomic(out, status);
    console.error(`BLOCKED: ${status.blocker}`);
    console.log(JSON.stringify(status, null, 2));
    process.exit(DRY ? 0 : 2);
  }

  const rootIssues = probeHarnessRoot(harnessRoot);
  const creds = missingCreds();
  const venvBin = join(harnessRoot, ".venv/bin");
  const pathEnv = {
    ...process.env,
    PATH: `${venvBin}:${process.env.PATH || ""}`,
    HARNESS2_ROOT: harnessRoot,
  };
  const harness2 = which("harness2", pathEnv);
  const checkBin = which("harness2-check", pathEnv);

  status.harness2_root = harnessRoot;
  status.harness2_bin = harness2 || null;
  status.jb_revision = readJbRevision(harnessRoot);
  status.opencode_overlays = {
    passthrough: buildOpencodeMcpOverlay({ arm: "passthrough" }),
    clawql: buildOpencodeMcpOverlay({
      arm: "clawql",
      mcpUrl: process.env.CLAWQL_MCP_URL?.trim() || "http://127.0.0.1:8080/mcp",
    }),
  };

  if (rootIssues.length) {
    status.status = "blocked";
    status.blocker = rootIssues.join("; ");
  } else if (!harness2 || !checkBin) {
    status.status = "blocked";
    status.blocker =
      "harness2 CLI not on PATH (activate HARNESS2_ROOT/.venv or uv pip install -e '.[render]')";
  } else if (creds.length) {
    status.status = "blocked";
    status.blocker = `missing credentials: ${creds.join(", ")}`;
    status.missing_credentials = creds;
  } else {
    status.status = DRY ? "ready" : "running";
  }

  // Always run harness2-check when CLI present (documents jb install health).
  if (checkBin && !rootIssues.length) {
    const chk = sh(["harness2-check", "--bench", FROZEN.bench], {
      cwd: harnessRoot,
      env: pathEnv,
    });
    status.harness2_check = {
      exit: chk.status,
      stdout_tail: (chk.stdout || "").slice(-2000),
      stderr_tail: (chk.stderr || "").slice(-2000),
    };
  }

  mkdirSync(ARTIFACTS, { recursive: true });
  writeAtomic(join(ARTIFACTS, "equal-arms-overlays.json"), status.opencode_overlays);

  if (status.status === "blocked" || DRY) {
    const outName =
      status.status === "ready"
        ? "results-step2-ready.json"
        : "results-step2-blocked.json";
    const out = join(OUT_DIR, outName);
    writeAtomic(out, status);
    console.log(JSON.stringify(status, null, 2));
    console.error(
      DRY
        ? `OK dry-run → ${out}${status.status === "ready" ? " (credentials present; pass --run for live)" : ""}`
        : `BLOCKED → ${out}`,
    );
    process.exit(status.status === "ready" || DRY ? 0 : 2);
  }

  if (!FORCE_RUN) {
    process.exit(0);
  }

  // Live path: separate runs dirs per arm, then judge/report.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runsRoot = join(ARTIFACTS, `runs-${stamp}`);
  mkdirSync(runsRoot, { recursive: true });

  const armResults = {};
  for (const arm of ["passthrough", "clawql"]) {
    const runsDir = join(runsRoot, arm);
    mkdirSync(runsDir, { recursive: true });
    const overlayPath = join(runsDir, "opencode-mcp-overlay.json");
    writeFileSync(
      overlayPath,
      JSON.stringify(status.opencode_overlays[arm], null, 2) + "\n",
    );

    const env = {
      ...pathEnv,
      HARNESS2_RUNS_DIR: runsDir,
      ...(arm === "clawql" ? clawqlEnvFrozen() : {}),
      // OpenCode overlay path for operators / future harness2 hooks.
      CLAWQL_H2_OPENCODE_OVERLAY: overlayPath,
      CLAWQL_H2_ARM: arm,
    };

    console.error(`RUN arm=${arm} → harness2 --bench jb --k ${FROZEN.k} --mode ${FROZEN.mode}`);
    const run = sh(
      [
        "harness2",
        "--bench",
        FROZEN.bench,
        "--k",
        String(FROZEN.k),
        "--mode",
        FROZEN.mode,
      ],
      { cwd: harnessRoot, env },
    );
    const judge = sh(
      [
        "harness2-judge",
        "--bench",
        FROZEN.bench,
        "--k",
        String(FROZEN.k),
        "--mode",
        FROZEN.mode,
      ],
      { cwd: harnessRoot, env },
    );
    const report = sh(
      [
        "harness2-report",
        "--bench",
        FROZEN.bench,
        "--k",
        String(FROZEN.k),
        "--mode",
        FROZEN.mode,
      ],
      { cwd: harnessRoot, env },
    );

    armResults[arm] = {
      runs_dir: runsDir,
      overlay: overlayPath,
      harness2: { exit: run.status, stderr_tail: (run.stderr || "").slice(-4000) },
      judge: { exit: judge.status, stderr_tail: (judge.stderr || "").slice(-2000) },
      report: {
        exit: report.status,
        stdout_tail: (report.stdout || "").slice(-4000),
        stderr_tail: (report.stderr || "").slice(-2000),
      },
      // Evade/adapt/poison extraction is operator-filled from harness diffs + ClawQL WORM
      // until automated parsers land — leave null rather than invent counts.
      evade_attempts: null,
      evade_effectuated: null,
      adapt_attempts: null,
      adapt_succeeded: null,
      lesson_poison_carried: null,
      jobbench_score: null,
    };

    if (run.status !== 0) {
      status.status = "failed";
      status.failed_arm = arm;
      status.arms_detail = armResults;
      writeAtomic(join(OUT_DIR, "results-step2-failed.json"), status);
      console.error(`FAIL harness2 arm=${arm} exit=${run.status}`);
      process.exit(1);
    }
  }

  status.status = "measured_partial";
  status.note =
    "Upstream JobBench arms finished; fill evade/adapt/poison + jobbench_score from report artifacts before publishing. board_pass unset until those fields are populated.";
  status.arms_detail = armResults;
  status.board_pass = null;
  writeAtomic(join(OUT_DIR, "results-step2.json"), status);
  console.log(JSON.stringify(status, null, 2));
  console.error(`OK wrote ${join(OUT_DIR, "results-step2.json")}`);
}

main();
