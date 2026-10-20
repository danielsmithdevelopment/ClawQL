#!/usr/bin/env node
/**
 * AgentDojo cell — next live hardness (ahead of remaining hosted models).
 *
 * Spawns the Python AgentDojo runner with ClawQL data-flow ToolsExecutor.
 * Must publish AgentDojo ASR + utility-under-attack; never invents scores.
 *
 *   npm run benchmark:multi-attack-injection:agentdojo
 *   MAI_AGENTDOJO=1 npm run benchmark:multi-attack-injection:agentdojo
 *   OPENAI_API_KEY=… MAI_AGENTDOJO=1 npm run benchmark:multi-attack-injection:agentdojo
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const PY = join(__dirname, "agentdojo", "run_benchmark.py");
const OUT =
  process.env.MAI_AGENTDOJO_OUT?.trim() ||
  join(
    ROOT,
    "docs/benchmarks/security-suite/multi-attack-injection/results-agentdojo.json"
  );
const LIVE_MODELS = JSON.parse(
  readFileSync(join(__dirname, "live-models.json"), "utf8")
);

function ensureAgentdojoInstalled() {
  const check = spawnSync("python3", ["-c", "import agentdojo"], {
    encoding: "utf8",
  });
  if (check.status === 0) return true;
  process.stderr.write("agentdojo not installed — attempting pip install…\n");
  const inst = spawnSync("pip3", ["install", "-q", "agentdojo"], {
    encoding: "utf8",
    stdio: "inherit",
  });
  return inst.status === 0;
}

if (!existsSync(PY)) {
  console.error(`missing ${PY}`);
  process.exit(2);
}

if (!ensureAgentdojoInstalled()) {
  const report = {
    kind: "multi_attack_injection_agentdojo_v1",
    status: "error",
    error: "agentdojo_python_package_missing",
    note: "pip install agentdojo failed — cannot run.",
    priority: LIVE_MODELS.runOrder?.next || "agentdojo",
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  process.exit(1);
}

const env = {
  ...process.env,
  MAI_AGENTDOJO_OUT: OUT,
  // Default: allow the Python runner to report credential gate without requiring MAI_AGENTDOJO
  // unless the caller set it. When unset, runner still writes wired_awaiting_llm_credentials.
};
if (process.env.MAI_AGENTDOJO === undefined) {
  // Explicit dry/status path — Python treats missing MAI_AGENTDOJO with creds as ready,
  // without creds as wired_awaiting.
}

const r = spawnSync("python3", [PY], {
  env,
  encoding: "utf8",
  cwd: join(__dirname, "agentdojo"),
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);

let status = "unknown";
try {
  status = JSON.parse(readFileSync(OUT, "utf8")).status;
} catch {
  /* ignore */
}

process.stdout.write(
  JSON.stringify(
    {
      out: OUT,
      status,
      exit: r.status,
      priority: LIVE_MODELS.runOrder?.next || "agentdojo",
      note:
        status === "wired_awaiting_llm_credentials"
          ? "ClawQL AgentDojo defense is wired. Provide OPENAI_API_KEY (or ANTHROPIC_API_KEY) and re-run with MAI_AGENTDOJO=1."
          : status === "measured"
            ? "AgentDojo ASR + utility published alongside ClawQL sink-block grades."
            : undefined,
    },
    null,
    2
  ) + "\n"
);

process.exitCode = r.status === null ? 1 : r.status;
