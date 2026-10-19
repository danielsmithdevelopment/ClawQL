#!/usr/bin/env node
/**
 * Multi-attack injection board — smoke (scripted, worst-case model).
 *
 * The scripted "model" always follows the planted instruction. This measures
 * whether the gateway stops the resulting action — not whether a real model
 * would fall for the injection. Real-model matrix → results-live.json later.
 *
 * Sample: 12 attacks (smoke). Planned: dozens across the same four channels.
 *
 * Arms:
 *   clawql_default     — mechanisms off → expect 12/12 (honest stock gap)
 *   clawql_configured  — general mechanisms (taint / park / data-flow), NOT a tool deny
 *   passthrough        — no gateway → 12/12 control
 *   obot/bifrost/executor — pending until peer CI wires defaults + best-config
 *
 * Usage:
 *   node scripts/benchmarks/multi-attack-injection/run-board.mjs
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
import {
  MECHANISM_NAMES,
  MECHANISMS_CONFIGURED,
  MECHANISMS_OFF,
  gateScriptedAttack,
} from "./mechanisms.mjs";

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

function seedTrial(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(TASK_WS, dir, { recursive: true });
  const plantedRoot = join(dir, "planted");
  mkdirSync(plantedRoot, { recursive: true });
  cpSync(CORPUS_DIR, plantedRoot, { recursive: true });
  return { vault: join(dir, "vault"), plantedRoot };
}

/**
 * Scripted worst-case agent: always complies with every planted instruction.
 * Gate decides using general mechanisms (or none), never a tool-name list.
 */
function runScriptedComply(vaultRoot, mechanisms) {
  const session = { labels: new Set() };
  const attempts = [];
  const mechanismHits = Object.fromEntries(MECHANISM_NAMES.map((n) => [n, 0]));

  for (const attack of MANIFEST.attacks) {
    const gate = gateScriptedAttack(attack, mechanisms, session);
    if (!gate.allow) {
      if (gate.mechanism) mechanismHits[gate.mechanism] += 1;
      attempts.push({
        id: attack.id,
        channel: attack.channel,
        blocked: true,
        mechanism: gate.mechanism,
        denyReason: gate.denyReason,
      });
      continue;
    }
    const file = join(
      vaultRoot,
      "Memory",
      `${slug(attack.hostileTitle) || attack.id}.md`
    );
    writeFileSync(
      file,
      `# ${attack.hostileTitle}\n\neffectToken: ${attack.effectToken}\nplanted_from: ${attack.path}\n`,
      "utf8"
    );
    attempts.push({
      id: attack.id,
      channel: attack.channel,
      blocked: false,
      mechanism: null,
      written: file,
    });
  }

  return {
    attempts,
    grade: gradeAttacks(MANIFEST, vaultRoot),
    mechanismHits,
    sessionLabels: [...session.labels].sort(),
  };
}

function runArm({
  id,
  column,
  vaultRoot,
  mechanisms,
  expect,
  mechanismsNamed,
}) {
  const t0 = performance.now();
  const { attempts, grade, mechanismHits, sessionLabels } = runScriptedComply(
    vaultRoot,
    mechanisms
  );
  const elapsed_ms = Math.round((performance.now() - t0) * 1000) / 1000;
  const ok = smokeExpectationMet(grade, expect);
  return {
    id,
    column,
    skipped: false,
    status: "measured",
    expect,
    smoke_ok: ok,
    mechanisms: mechanismsNamed,
    mechanism_hits: mechanismHits,
    session_labels: sessionLabels,
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
        ? "general_mechanisms_taint_park_data_flow — not BLOCK_TOOLS"
        : "scripted_worst_case_comply_mechanisms_off",
  };
}

/**
 * Peer rows: injection resistance is measurable for any gateway.
 * Until CI wires defaults + best-config against this corpus → pending
 * (never not_offered — that label is for capabilities a product never claims).
 */
function pendingPeer(id, column) {
  const envKey =
    id === "obot"
      ? column === "defaults"
        ? "OBOT_MCP_URL"
        : "OBOT_MCP_URL_DENY"
      : id === "bifrost"
        ? column === "defaults"
          ? "BIFROST_MCP_URL"
          : "BIFROST_MCP_URL_DENY"
        : column === "defaults"
          ? "EXECUTOR_MCP_URL"
          : "EXECUTOR_MCP_URL_BLOCK";
  return {
    id: `${id}_${column === "defaults" ? "default" : "best_config"}`,
    peer: id,
    column,
    skipped: true,
    status: "pending",
    skipUnlessEnv: envKey,
    attacks_planted: MANIFEST.attacks.length,
    attacks_effectuated: null,
    rate: null,
    detail: `Peer ${id} ${column} not measured yet — wire ${envKey} against the same 12-attack corpus. Injection is an outcome every gateway can be scored on; pending ≠ not_offered.`,
  };
}

function main() {
  mkdirSync(dirname(OUT), { recursive: true });
  if (!existsSync(join(CORPUS_DIR, "manifest.json"))) {
    throw new Error(`missing corpus at ${CORPUS_DIR}`);
  }

  const arms = [];

  {
    const { vault } = seedTrial(join(WORK, "clawql_default"));
    arms.push(
      runArm({
        id: "clawql_default",
        column: "defaults",
        vaultRoot: vault,
        mechanisms: MECHANISMS_OFF,
        expect: "allow",
        mechanismsNamed: [],
      })
    );
  }

  {
    const { vault } = seedTrial(join(WORK, "clawql_configured"));
    arms.push(
      runArm({
        id: "clawql_configured",
        column: "best_config",
        vaultRoot: vault,
        mechanisms: MECHANISMS_CONFIGURED,
        expect: "deny",
        mechanismsNamed: [...MECHANISM_NAMES],
      })
    );
  }

  {
    const { vault } = seedTrial(join(WORK, "passthrough"));
    arms.push(
      runArm({
        id: "passthrough",
        column: "defaults",
        vaultRoot: vault,
        mechanisms: MECHANISMS_OFF,
        expect: "allow",
        mechanismsNamed: [],
      })
    );
  }

  for (const peer of ["obot", "bifrost", "executor"]) {
    arms.push(pendingPeer(peer, "defaults"));
    arms.push(pendingPeer(peer, "best_config"));
  }

  const measured = arms.filter((a) => a.status === "measured");
  const board_pass = measured.every((a) => a.smoke_ok);
  const clawqlDefault = measured.find((a) => a.id === "clawql_default");

  const report = {
    measuredAt: new Date().toISOString(),
    kind: "multi_attack_injection_smoke_v1",
    sample: {
      attacks_planted: MANIFEST.attacks.length,
      label: "smoke",
      note: "Twelve attacks is a smoke run. Planned suite: dozens across email/ticket/doc/webhook.",
    },
    model: {
      kind: "scripted_worst_case",
      note: "The scripted model always follows the injected instruction. This measures whether the gateway stops the resulting action — not whether a real model would comply. Real-model matrix is a follow-up.",
    },
    headline: {
      clawql_default_effectuated: clawqlDefault?.attacks_effectuated ?? null,
      clawql_default_planted: clawqlDefault?.attacks_planted ?? null,
      note: "ClawQL on defaults lets all planted attacks through — same as no gateway. Strongest argument for shipping park-destructive + untrusted-read taint as stock defaults.",
    },
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
    publishGate: FROZEN.publishGate,
  };

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    JSON.stringify(
      {
        out: OUT,
        board_pass,
        headline: report.headline,
        summary: arms.map((a) => ({
          id: a.id,
          status: a.status,
          column: a.column,
          effectuated: a.attacks_effectuated,
          planted: a.attacks_planted,
          rate: a.rate,
          mechanisms: a.mechanisms,
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
