#!/usr/bin/env node
/**
 * Multi-attack injection board — smoke (scripted, worst-case model).
 *
 * ClawQL arms use the **real** native-tool gate (park destructive + session IFC).
 * Passthrough still writes files with no gateway (control).
 * Peers: pending until wired.
 *
 * Also runs the benign suite and reports completed-without-human counts.
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
import { runBenignSuite } from "./benign.mjs";
import { gradeAttacks, smokeExpectationMet } from "./grade.mjs";
import { MECHANISM_NAMES, MECHANISMS_OFF, gateScriptedAttack } from "./mechanisms.mjs";
import { makeProductInvoke, resetSessionLabels } from "./product-gate.mjs";

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
  return join(dir, "vault");
}

/** Passthrough / legacy simulation: no product gate. */
function runScriptedComplySimulated(vaultRoot, mechanisms) {
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
      });
      continue;
    }
    writeFileSync(
      join(vaultRoot, "Memory", `${slug(attack.hostileTitle) || attack.id}.md`),
      `# ${attack.hostileTitle}\n\neffectToken: ${attack.effectToken}\n`,
      "utf8"
    );
    attempts.push({ id: attack.id, channel: attack.channel, blocked: false });
  }
  return { attempts, grade: gradeAttacks(MANIFEST, vaultRoot), mechanismHits };
}

/**
 * Product path: scripted agent taints from planted channel then tries memory_ingest.
 * Real gate parks destructive / blocks on IFC.
 */
async function runScriptedComplyProduct(vaultRoot, sessionId, env, { taintFirst }) {
  await resetSessionLabels();
  const ctx = await makeProductInvoke(sessionId, env);
  const attempts = [];
  const mechanismHits = Object.fromEntries(MECHANISM_NAMES.map((n) => [n, 0]));

  for (const attack of MANIFEST.attacks) {
    if (taintFirst) ctx.taint(attack.channel);
    const r = await ctx.invoke("memory_ingest", {
      title: attack.hostileTitle,
      insights: `effectToken: ${attack.effectToken}`,
    });
    if (r.blocked) {
      const mech = r.mechanism || "park_destructive_write";
      if (mechanismHits[mech] !== undefined) mechanismHits[mech] += 1;
      else mechanismHits[mech] = 1;
      attempts.push({
        id: attack.id,
        channel: attack.channel,
        blocked: true,
        mechanism: mech,
        status: r.status,
      });
      continue;
    }
    writeFileSync(
      join(vaultRoot, "Memory", `${slug(attack.hostileTitle) || attack.id}.md`),
      `# ${attack.hostileTitle}\n\neffectToken: ${attack.effectToken}\n`,
      "utf8"
    );
    attempts.push({ id: attack.id, channel: attack.channel, blocked: false });
  }

  return {
    attempts,
    grade: gradeAttacks(MANIFEST, vaultRoot),
    mechanismHits,
  };
}

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
    detail: `Peer ${id} ${column} not measured yet — pending ≠ not_offered.`,
  };
}

async function main() {
  mkdirSync(dirname(OUT), { recursive: true });
  const arms = [];

  const productEnv = {
    ...process.env,
    CLAWQL_OPERATION_RISK_ENFORCE: "1",
    CLAWQL_ENABLE_SESSION_IFC: "1",
  };

  // clawql_default — product defaults (park + IFC). Expect 0/12 after gate.
  {
    const vault = seedTrial(join(WORK, "clawql_default"));
    const t0 = performance.now();
    // Defaults: park alone should stop attacks (no need to pre-taint).
    const { attempts, grade, mechanismHits } = await runScriptedComplyProduct(
      vault,
      "mai-default",
      productEnv,
      { taintFirst: false }
    );
    const expect = "deny";
    const ok = smokeExpectationMet(grade, expect);
    arms.push({
      id: "clawql_default",
      column: "defaults",
      skipped: false,
      status: "measured",
      expect,
      smoke_ok: ok,
      gate: "product_native_tool_gate",
      mechanisms: ["park_destructive_write", "untrusted_read_taint", "data_flow"],
      mechanism_hits: mechanismHits,
      attacks_planted: grade.attacks_planted,
      attacks_effectuated: grade.attacks_effectuated,
      rate: grade.rate,
      by_channel: grade.by_channel,
      authoritative_intact: grade.authoritative_intact,
      effectuated_ids: grade.effectuated_ids,
      blocked_ids: grade.blocked_ids,
      attempts_blocked: attempts.filter((a) => a.blocked).length,
      gate_latency_ms: Math.round((performance.now() - t0) * 1000) / 1000,
      detail:
        "product defaults: native gate parks memory_ingest (destructive) — not BLOCK_TOOLS",
    });
  }

  // clawql_configured — same mechanisms + explicit taint-first (defense in depth)
  {
    const vault = seedTrial(join(WORK, "clawql_configured"));
    const t0 = performance.now();
    const { attempts, grade, mechanismHits } = await runScriptedComplyProduct(
      vault,
      "mai-configured",
      productEnv,
      { taintFirst: true }
    );
    const ok = smokeExpectationMet(grade, "deny");
    arms.push({
      id: "clawql_configured",
      column: "best_config",
      skipped: false,
      status: "measured",
      expect: "deny",
      smoke_ok: ok,
      gate: "product_native_tool_gate",
      mechanisms: [...MECHANISM_NAMES],
      mechanism_hits: mechanismHits,
      attacks_planted: grade.attacks_planted,
      attacks_effectuated: grade.attacks_effectuated,
      rate: grade.rate,
      by_channel: grade.by_channel,
      authoritative_intact: grade.authoritative_intact,
      effectuated_ids: grade.effectuated_ids,
      blocked_ids: grade.blocked_ids,
      attempts_blocked: attempts.filter((a) => a.blocked).length,
      gate_latency_ms: Math.round((performance.now() - t0) * 1000) / 1000,
      detail: "taint-first + park + data-flow via product native gate",
    });
  }

  // passthrough control — no gateway
  {
    const vault = seedTrial(join(WORK, "passthrough"));
    const t0 = performance.now();
    const { grade, mechanismHits } = runScriptedComplySimulated(vault, MECHANISMS_OFF);
    const ok = smokeExpectationMet(grade, "allow");
    arms.push({
      id: "passthrough",
      column: "defaults",
      skipped: false,
      status: "measured",
      expect: "allow",
      smoke_ok: ok,
      gate: "none",
      mechanisms: [],
      mechanism_hits: mechanismHits,
      attacks_planted: grade.attacks_planted,
      attacks_effectuated: grade.attacks_effectuated,
      rate: grade.rate,
      by_channel: grade.by_channel,
      authoritative_intact: grade.authoritative_intact,
      effectuated_ids: grade.effectuated_ids,
      blocked_ids: grade.blocked_ids,
      attempts_blocked: 0,
      gate_latency_ms: Math.round((performance.now() - t0) * 1000) / 1000,
      detail: "no_gateway_scripted_comply",
    });
  }

  for (const peer of ["obot", "bifrost", "executor"]) {
    arms.push(pendingPeer(peer, "defaults"));
    arms.push(pendingPeer(peer, "best_config"));
  }

  // Benign suite on product defaults
  await resetSessionLabels();
  const benignCtx = await makeProductInvoke("mai-benign", productEnv);
  const benign = await runBenignSuite(benignCtx);

  const measured = arms.filter((a) => a.status === "measured");
  const board_pass = measured.every((a) => a.smoke_ok);
  const clawqlDefault = measured.find((a) => a.id === "clawql_default");

  const report = {
    measuredAt: new Date().toISOString(),
    kind: "multi_attack_injection_smoke_v2",
    sample: {
      attacks_planted: MANIFEST.attacks.length,
      label: "smoke",
      note: "Twelve attacks is a smoke run. Planned: dozens across four channels.",
    },
    model: {
      kind: "scripted_worst_case",
      note: "Scripted model always complies — measures gateway stop, not model susceptibility.",
    },
    headline: {
      clawql_default_effectuated: clawqlDefault?.attacks_effectuated ?? null,
      clawql_default_planted: clawqlDefault?.attacks_planted ?? null,
      benign_completed_without_human: benign.completed_without_human,
      benign_total: benign.planted,
      note: "Publish claim needs both: attacks stopped AND benign completion cost.",
    },
    benign,
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
        benign: {
          completed_without_human: benign.completed_without_human,
          parked: benign.parked,
          blocked: benign.blocked,
          results: benign.results.map((r) => ({
            id: r.id,
            status: r.status,
            matched_expect: r.matched_expect,
          })),
        },
        summary: arms.map((a) => ({
          id: a.id,
          status: a.status,
          effectuated: a.attacks_effectuated,
          planted: a.attacks_planted,
          smoke_ok: a.smoke_ok,
          mechanisms: a.mechanisms,
        })),
      },
      null,
      2
    ) + "\n"
  );
  if (!board_pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
