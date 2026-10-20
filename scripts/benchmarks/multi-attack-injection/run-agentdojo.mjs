#!/usr/bin/env node
/**
 * AgentDojo cell — next live hardness (ahead of remaining hosted models).
 *
 * When measured, must publish AgentDojo ASR + utility-under-attack alongside
 * ClawQL grades. This entrypoint is a scaffold until the AgentDojo env and
 * ClawQL MCP defense arm are wired for a real run.
 *
 *   npm run benchmark:multi-attack-injection:agentdojo
 *   MAI_AGENTDOJO=1 node run-agentdojo.mjs   # reserved for live run
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const OUT =
  process.env.MAI_AGENTDOJO_OUT?.trim() ||
  join(
    ROOT,
    "docs/benchmarks/security-suite/multi-attack-injection/results-agentdojo.json"
  );
const LIVE_MODELS = JSON.parse(
  readFileSync(join(__dirname, "live-models.json"), "utf8")
);

const agentdojoSpec =
  LIVE_MODELS.corpusNext?.published?.find((p) => p.id === "agentdojo") || {};

const report = {
  kind: "multi_attack_injection_agentdojo_v1",
  status: "pending",
  measuredAt: null,
  priority: LIVE_MODELS.runOrder?.next || "agentdojo",
  priority_why: LIVE_MODELS.runOrder?.why || null,
  upstream: {
    name: "AgentDojo",
    url: agentdojoSpec.url || "https://github.com/ethz-spylab/agentdojo",
  },
  must_report: {
    agentdojo_asr: null,
    agentdojo_utility_under_attack: null,
    note: agentdojoSpec.scoring?.note || null,
  },
  also_report: {
    clawql_attacks_effectuated: null,
    clawql_poison_residue: null,
    clawql_benign: null,
  },
  how_to_run:
    "Wire AgentDojo against ClawQL MCP, then set MAI_AGENTDOJO=1 and implement the live path in this file. Until then status stays pending.",
  note: "Scaffold only — no invented ASR/utility. Scripted board and live model table publish independently.",
};

if (process.env.MAI_AGENTDOJO === "1") {
  report.status = "incomplete";
  report.note =
    "MAI_AGENTDOJO=1 set but AgentDojo defense arm is not wired yet — refusing to invent scores.";
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ out: OUT, status: report.status }, null, 2)}\n`);
  process.exitCode = 3;
  process.exit();
}

// Default: refresh pending artifact from registry (idempotent).
const existing = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, "utf8"))
  : null;
if (existing?.status === "measured") {
  process.stdout.write(
    JSON.stringify(
      {
        out: OUT,
        status: existing.status,
        note: "Measured artifact present — not overwriting.",
        agentdojo_asr: existing.must_report?.agentdojo_asr ?? null,
        agentdojo_utility: existing.must_report?.agentdojo_utility_under_attack ?? null,
      },
      null,
      2
    ) + "\n"
  );
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(
  JSON.stringify(
    {
      out: OUT,
      status: report.status,
      priority: report.priority,
      must_report: Object.keys(report.must_report).filter((k) => k !== "note"),
      note: "AgentDojo is next — ahead of remaining hosted models.",
    },
    null,
    2
  ) + "\n"
);
