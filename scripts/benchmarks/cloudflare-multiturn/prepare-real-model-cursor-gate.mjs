#!/usr/bin/env node
/**
 * Prepare Cursor-native real-model gate state (no API secrets).
 *
 * Reuses or starts mock+ClawQL, freezes precommit, writes WORKFLOW.md + hints,
 * creates interleaved session directories for known_op + executor_v2.
 *
 *   node scripts/benchmarks/cloudflare-multiturn/prepare-real-model-cursor-gate.mjs
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  cpSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { GATE_VERDICT_RULES } from "./run-real-model.mjs";
import { FAKE } from "./lib/fixture-ids.mjs";
import { ensureExecutorOpenapiApp } from "./lib/ensure-executor-openapi-app.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const STATE = process.env.CF_MT_REAL_GATE_STATE || "/tmp/cf-mt-real-gate";
const ITERS = Math.max(1, Number(process.env.CF_MT_REAL_ITERS || 50) || 50);
const ARMS = (process.env.CF_MT_REAL_ARMS || "clawql_known_op,executor_v2")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const PINNED = GATE_VERDICT_RULES.pinned_models;
const REVISION = GATE_VERDICT_RULES.models_pin_revision;
const MODELS = [
  { label: "frontier", id: PINNED.frontier },
  { label: "small", id: PINNED.small },
];

mkdirSync(STATE, { recursive: true });

function resolveClawqlMcp() {
  const candidates = [
    join(STATE, "clawql/meta.json"),
    "/tmp/cf-mt-real-v2/meta.json",
    "/tmp/cf-mt-real/meta.json",
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const meta = JSON.parse(readFileSync(p, "utf8"));
    if (meta.mcpUrl) return { ...meta, source: p };
  }
  return null;
}

async function startFreshClawql() {
  const home = join(STATE, "clawql");
  mkdirSync(home, { recursive: true });
  const child = spawn(
    process.execPath,
    [join(HERE, "start-real-model-servers.mjs")],
    {
      env: {
        ...process.env,
        PORT: "",
        MT_MOCK_PORT: "0",
        CF_MT_REAL_STATE: home,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => {
    out += d.toString();
  });
  child.stderr.on("data", (d) => {
    err += d.toString();
  });
  const code = await new Promise((r) => child.on("exit", r));
  if (code !== 0) throw new Error(`start-real-model-servers failed: ${err || out}`);
  const line = out.trim().split("\n").filter(Boolean).at(-1);
  return { ...JSON.parse(line), source: "fresh" };
}

let clawql = resolveClawqlMcp();
if (!clawql) {
  clawql = await startFreshClawql();
}

const openapiDoc = JSON.parse(
  readFileSync(join(HERE, "fixtures/curated-openapi.json"), "utf8")
);
const executorMeta = ensureExecutorOpenapiApp({
  mockBase: clawql.mockBase,
  openapiDoc,
});

// Tool schema for blind known-op (list-tools execute entry).
const listToolsPath = join(STATE, "list-tools.json");
const schemaPath = join(STATE, "execute-tool-schema.json");
if (!existsSync(schemaPath)) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    [join(HERE, "lib/real-model-mcp-cli.mjs"), "list-tools"],
    {
      env: { ...process.env, CF_MT_REAL_MCP_URL: clawql.mcpUrl },
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  if (r.status === 0) {
    writeFileSync(listToolsPath, r.stdout);
    const tools = JSON.parse(r.stdout);
    const execute = tools.find((t) => t.name === "execute");
    if (execute) writeFileSync(schemaPath, JSON.stringify(execute, null, 2) + "\n");
  }
}

const fixtureHint = {
  auditZoneName: FAKE.auditZoneName,
  auditZoneId: FAKE.auditZoneId,
  accountId: FAKE.accountId,
  targetIp: FAKE.targetIp,
  workerScriptName: FAKE.workerScriptName,
  unproxiedRecordId: FAKE.unproxiedRecordId,
};
writeFileSync(join(STATE, "fixture-hint.json"), JSON.stringify(fixtureHint, null, 2) + "\n");
writeFileSync(join(STATE, "mcp-url"), clawql.mcpUrl + "\n");
writeFileSync(
  join(STATE, "executor.json"),
  JSON.stringify(
    {
      url: process.env.EXECUTOR_V2_URL || "http://127.0.0.1:4312/mcp",
      apiKeyPath: "/tmp/executor-v2-data/api_key.txt",
      app: executorMeta,
    },
    null,
    2
  ) + "\n"
);

// Prefer shipping operation ids from prior pilot if present.
const opIdsSrc = "/tmp/cf-mt-real-v2/operation-ids-by-step.json";
if (existsSync(opIdsSrc)) {
  cpSync(opIdsSrc, join(STATE, "operation-ids-by-step.json"));
}

const frozenAt = new Date().toISOString();
const precommit = {
  frozen_at: frozenAt,
  models_pin_revision: REVISION,
  transport: "cursor_subscription_subagents",
  models: MODELS,
  pinned: PINNED,
  temperature: "cursor_task_default",
  system_prompt_shared: true,
  ordering: "interleave_sessions_across_arms",
  arms: ARMS,
  iters_per_arm: ITERS,
  token_ceiling: 10_000,
  primary_pair: GATE_VERDICT_RULES.primary_pair,
  comparison_metrics: [
    "weighted_tokens_median",
    "weighted_tokens_p90",
    "observation_tokens_over_ceiling",
    "task_success_rate",
  ],
  verdict_rules: GATE_VERDICT_RULES,
  dual_model_claim_eligible: true,
  note:
    "Frozen before the first session. Blog/explainer claims must follow verdict_rules; do not re-interpret after seeing results.",
};
writeFileSync(join(STATE, "precommit.json"), JSON.stringify(precommit, null, 2) + "\n");
writeFileSync(
  join(ROOT, "docs/benchmarks/cloudflare-multiturn/real-model-cursor-gate-precommit.json"),
  JSON.stringify(precommit, null, 2) + "\n"
);

for (const model of MODELS) {
  for (const arm of ARMS) {
    mkdirSync(join(STATE, "sessions", model.label, arm), { recursive: true });
  }
}

const workflow = `# Cursor real-model gate (blind)

Precommit revision: \`${REVISION}\`
Models: frontier=\`${PINNED.frontier}\` · small=\`${PINNED.small}\`
Iters: ${ITERS} per arm · Arms: ${ARMS.join(", ")}
Ordering: for each model, for i=1..${ITERS}, run each arm session i (interleaved).

## Shared paths

- Fixture IDs: \`${STATE}/fixture-hint.json\`
- ClawQL MCP URL: \`${STATE}/mcp-url\` (currently ${clawql.mcpUrl})
- Execute schema: \`${STATE}/execute-tool-schema.json\`
- Per-step operationId + args (no where): \`${STATE}/operation-ids-by-step.json\`
- Executor meta: \`${STATE}/executor.json\`

## CLI (known_op)

\`\`\`bash
export CF_MT_REAL_MCP_URL=$(cat ${STATE}/mcp-url)
export CF_MT_REAL_CALL_LOG=${STATE}/sessions/<modelLabel>/clawql_known_op/session-<N>-calls.jsonl
CLI="node ${join(HERE, "lib/real-model-mcp-cli.mjs")}"
$CLI execute '<json>'
\`\`\`

FORBIDDEN for known_op: reading \`clawql-shapes.mjs\`, published-scripts, other sessions, or any file with expected \`where\` strings.

## Outputs per session

- \`session-<N>.json\` — observations \`{"1":…,"12":…}\`
- \`session-<N>-meta.json\` — \`{ok,turns,whereAttempts,whereMalformed,toolErrors,cheated,notes,failed}\`
- \`session-<N>-calls.jsonl\` — tokenized tool calls (CLI)

Then: \`node ${join(HERE, "lib/check-real-session.mjs")} …/session-<N>.json\`
`;

writeFileSync(join(STATE, "WORKFLOW.md"), workflow);

console.log(
  JSON.stringify(
    {
      state: STATE,
      precommit_wrote: join(STATE, "precommit.json"),
      repo_precommit:
        "docs/benchmarks/cloudflare-multiturn/real-model-cursor-gate-precommit.json",
      clawql,
      models: MODELS,
      arms: ARMS,
      iters: ITERS,
      revision: REVISION,
    },
    null,
    2
  )
);
