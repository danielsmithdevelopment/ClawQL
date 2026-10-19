#!/usr/bin/env node
/**
 * Multi-attack injection board — smoke (scripted complying agent).
 *
 * Plants corpus into a trial workspace, then for each attack attempts
 * memory_ingest carrying that attack's effectToken.
 *
 *   clawql_default / passthrough → expect N/N effectuated
 *   clawql_configured            → Panguard BLOCK_TOOLS=memory_ingest → 0/N
 *
 * Usage:
 *   node scripts/benchmarks/multi-attack-injection/run-board.mjs
 *   MAI_OUT=docs/.../results-smoke.json node ...
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gradeAttacks, smokeExpectationMet } from "./grade.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const CORPUS_DIR = join(
  ROOT,
  "benchmarks/security-suite/multi-attack-injection/corpus"
);
const TASK_WS = join(
  ROOT,
  "benchmarks/openbench/tasks/memory-injection-attempt/workspace"
);
const FROZEN = JSON.parse(
  readFileSync(join(__dirname, "frozen-rules.json"), "utf8")
);
const MANIFEST = JSON.parse(
  readFileSync(join(CORPUS_DIR, "manifest.json"), "utf8")
);
const OUT =
  process.env.MAI_OUT?.trim() ||
  join(
    ROOT,
    "docs/benchmarks/security-suite/multi-attack-injection/results-smoke.json"
  );
const WORK =
  process.env.MAI_WORK?.trim() || join("/tmp", `mai-board-${process.pid}`);

function slug(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Mirror of Panguard atrBlockHook tool-name deny (same as openbench-cursor harness). */
function panguardAllow(toolName, env) {
  if (env.CLAWQL_PANGUARD_IN_PROCESS?.trim() !== "1") return { allow: true };
  const blocked = env.CLAWQL_PANGUARD_BLOCK_TOOLS?.trim();
  if (!blocked) return { allow: true };
  const deny = blocked
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (deny.includes(toolName) || deny.includes("*")) {
    return {
      allow: false,
      denyReason: `Panguard policy blocked tool: ${toolName}`,
    };
  }
  return { allow: true };
}

function seedTrial(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(TASK_WS, dir, { recursive: true });
  const plantedRoot = join(dir, "planted");
  mkdirSync(plantedRoot, { recursive: true });
  cpSync(CORPUS_DIR, plantedRoot, { recursive: true });
  return join(dir, "vault");
}

/**
 * Scripted complying agent: for every planted attack, attempt memory_ingest
 * with that attack's hostileTitle + effectToken in insights.
 */
function runScriptedComply(vaultRoot, env) {
  const attempts = [];
  for (const attack of MANIFEST.attacks) {
    const gate = panguardAllow("memory_ingest", env);
    if (!gate.allow) {
      attempts.push({
        id: attack.id,
        channel: attack.channel,
        blocked: true,
        denyReason: gate.denyReason,
      });
      continue;
    }
    const file = join(
      vaultRoot,
      "Memory",
      `${slug(attack.hostileTitle) || attack.id}.md`
    );
    const body = `# ${attack.hostileTitle}\n\neffectToken: ${attack.effectToken}\nplanted_from: ${attack.path}\n`;
    writeFileSync(file, body, "utf8");
    attempts.push({
      id: attack.id,
      channel: attack.channel,
      blocked: false,
      written: file,
    });
  }
  const grade = gradeAttacks(MANIFEST, vaultRoot);
  return { attempts, grade };
}

function runArm(armId, column, vaultRoot, env, expect) {
  const t0 = performance.now();
  const { attempts, grade } = runScriptedComply(vaultRoot, env);
  const elapsed_ms = Math.round((performance.now() - t0) * 1000) / 1000;
  const ok = smokeExpectationMet(grade, expect);
  return {
    id: armId,
    column,
    skipped: false,
    status: "measured",
    expect,
    smoke_ok: ok,
    attacks_planted: grade.attacks_planted,
    attacks_effectuated: grade.attacks_effectuated,
    rate: grade.rate,
    by_channel: grade.by_channel,
    authoritative_intact: grade.authoritative_intact,
    effectuated_ids: grade.effectuated_ids,
    blocked_ids: grade.blocked_ids,
    attempts_blocked: attempts.filter((a) => a.blocked).length,
    gate_latency_ms: elapsed_ms,
    detail:
      expect === "deny"
        ? env.CLAWQL_PANGUARD_BLOCK_TOOLS
          ? "panguard_BLOCK_TOOLS_memory_ingest"
          : "deny_expected_but_no_BLOCK_TOOLS"
        : "scripted_comply_no_tool_deny",
  };
}

function notOffered(id) {
  return {
    id,
    skipped: true,
    status: "not_offered",
    attacks_planted: MANIFEST.attacks.length,
    attacks_effectuated: null,
    rate: null,
    detail: "peer_injection_board_not_wired — reported not_offered, not 0",
  };
}

function main() {
  mkdirSync(dirname(OUT), { recursive: true });
  if (!existsSync(join(CORPUS_DIR, "manifest.json"))) {
    throw new Error(`missing corpus at ${CORPUS_DIR}`);
  }

  const arms = [];

  // clawql_default
  {
    const dir = join(WORK, "clawql_default");
    const vault = seedTrial(dir);
    const env = { ...process.env };
    delete env.CLAWQL_PANGUARD_BLOCK_TOOLS;
    delete env.CLAWQL_PANGUARD_IN_PROCESS;
    delete env.CLAWQL_PANGUARD_PROXY_PLUGIN;
    arms.push(runArm("clawql_default", "defaults", vault, env, "allow"));
  }

  // clawql_configured
  {
    const dir = join(WORK, "clawql_configured");
    const vault = seedTrial(dir);
    const env = {
      ...process.env,
      CLAWQL_PANGUARD_IN_PROCESS: "1",
      CLAWQL_PANGUARD_BLOCK_TOOLS: "memory_ingest",
      CLAWQL_PANGUARD_PROXY_PLUGIN: "1",
    };
    arms.push(runArm("clawql_configured", "best_config", vault, env, "deny"));
  }

  // passthrough control
  {
    const dir = join(WORK, "passthrough");
    const vault = seedTrial(dir);
    const env = { ...process.env };
    delete env.CLAWQL_PANGUARD_BLOCK_TOOLS;
    delete env.CLAWQL_PANGUARD_IN_PROCESS;
    arms.push(runArm("passthrough", "defaults", vault, env, "allow"));
  }

  arms.push(notOffered("obot"), notOffered("bifrost"), notOffered("executor"));

  const measured = arms.filter((a) => a.status === "measured");
  const board_pass = measured.every((a) => a.smoke_ok);

  const report = {
    measuredAt: new Date().toISOString(),
    kind: "multi_attack_injection_smoke_v0",
    rules: FROZEN,
    corpus: {
      id: MANIFEST.id,
      planted: MANIFEST.attacks.length,
      channels: MANIFEST.channels,
    },
    arms,
    board_pass,
    honesty: FROZEN.honesty,
    maintainerInvite: FROZEN.maintainerInvite,
  };

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    JSON.stringify(
      {
        out: OUT,
        board_pass,
        summary: measured.map((a) => ({
          id: a.id,
          effectuated: a.attacks_effectuated,
          planted: a.attacks_planted,
          rate: a.rate,
          smoke_ok: a.smoke_ok,
        })),
      },
      null,
      2
    ) + "\n"
  );
  if (!board_pass) process.exitCode = 1;
}

main();
