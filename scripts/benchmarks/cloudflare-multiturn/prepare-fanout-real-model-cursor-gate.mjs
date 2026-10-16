#!/usr/bin/env node
/**
 * Prepare Cursor-native fan-out real-model gate (known_op vs program).
 * Freezes precommit BEFORE any session. No API secrets.
 *
 *   CF_MT_REAL_ITERS=5 node scripts/benchmarks/cloudflare-multiturn/prepare-fanout-real-model-cursor-gate.mjs
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { FAKE } from "./lib/fixture-ids.mjs";
import { FANOUT_CALLS } from "./lib/fanout-join-shapes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const STATE = process.env.CF_MT_FANOUT_GATE_STATE || "/tmp/cf-mt-fanout-gate";
const ITERS = Math.max(1, Number(process.env.CF_MT_REAL_ITERS || 50) || 50);
const ARMS = (process.env.CF_MT_REAL_ARMS || "clawql_known_op,clawql_program")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const PINNED = {
  frontier: "gpt-5.6-sol-medium",
  small: "composer-2.5-fast",
};
const REVISION = "2026-10-16-fanout-cursor-native";
const MODELS = [
  { label: "frontier", id: PINNED.frontier },
  { label: "small", id: PINNED.small },
];

const VERDICT_RULES = {
  id: "cf-mt-fanout-real-model-gate-v1",
  models_pin_revision: REVISION,
  pinned_models: { ...PINNED },
  spec: "docs/benchmarks/cloudflare-multiturn/fanout-join/SPEC.md#real-model-gate-freeze",
  primary_pair: ["clawql_program", "clawql_known_op"],
  win_requires: [
    "program.weighted_tokens_median < known_op.weighted_tokens_median",
    "program.weighted_tokens_p90 < known_op.weighted_tokens_p90",
    "program.task_success_rate >= known_op.task_success_rate",
    "program.observation_tokens_over_ceiling <= known_op.observation_tokens_over_ceiling",
    "program.turns_mean < known_op.turns_mean",
  ],
  dual_model_claim:
    "program beats known-op on fan-out/join for real models — only if win on both frontier and small",
  single_model_claim: "report that model only; not the dual-model claim",
};

mkdirSync(STATE, { recursive: true });

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
        CLAWQL_ENABLE_PROGRAMS: "1",
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
  // Prefer meta.json written by the starter; fall back to last JSON line on stdout.
  const metaPath = join(home, "meta.json");
  if (existsSync(metaPath)) {
    return { ...JSON.parse(readFileSync(metaPath, "utf8")), source: "fresh" };
  }
  const line = out
    .trim()
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .at(-1);
  if (!line) throw new Error(`start-real-model-servers produced no meta: ${err || out}`);
  return { ...JSON.parse(line), source: "fresh" };
}

function resolveClawqlMcp() {
  const p = join(STATE, "clawql/meta.json");
  if (!existsSync(p)) return null;
  const meta = JSON.parse(readFileSync(p, "utf8"));
  if (meta.mcpUrl && meta.enablePrograms) return { ...meta, source: p };
  return null;
}

let clawql = resolveClawqlMcp();
if (!clawql) {
  clawql = await startFreshClawql();
}

// Known-op: operationId + args only (no where) — model writes where.
const knownOps = FANOUT_CALLS.map((c) => ({
  id: c.id,
  operationId: c.operationId,
  args: c.args,
}));
writeFileSync(join(STATE, "fanout-known-ops.json"), JSON.stringify(knownOps, null, 2) + "\n");

const fixtureHint = {
  auditZoneName: FAKE.auditZoneName,
  auditZoneId: FAKE.auditZoneId,
  accountId: FAKE.accountId,
};
writeFileSync(join(STATE, "fixture-hint.json"), JSON.stringify(fixtureHint, null, 2) + "\n");
writeFileSync(join(STATE, "mcp-url"), clawql.mcpUrl + "\n");

// Tool schemas for blind arms
const { spawnSync } = await import("node:child_process");
const list = spawnSync(
  process.execPath,
  [join(HERE, "lib/real-model-mcp-cli.mjs"), "list-tools"],
  {
    env: { ...process.env, CF_MT_REAL_MCP_URL: clawql.mcpUrl },
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }
);
if (list.status === 0) {
  writeFileSync(join(STATE, "list-tools.json"), list.stdout);
  const tools = JSON.parse(list.stdout);
  const execute = tools.find((t) => t.name === "execute");
  const prog = tools.find((t) => t.name === "execute_program");
  if (execute) {
    writeFileSync(join(STATE, "execute-tool-schema.json"), JSON.stringify(execute, null, 2) + "\n");
  }
  if (prog) {
    writeFileSync(
      join(STATE, "execute-program-tool-schema.json"),
      JSON.stringify(prog, null, 2) + "\n"
    );
  }
}

const frozenAt = new Date().toISOString();
const precommit = {
  frozen_at: frozenAt,
  models_pin_revision: REVISION,
  transport: "cursor_subscription_subagents",
  workflow: "fanout_join",
  models: MODELS,
  pinned: PINNED,
  temperature: "cursor_task_default",
  system_prompt_shared: true,
  ordering: "interleave_sessions_across_arms",
  arms: ARMS,
  iters_per_arm: ITERS,
  token_ceiling: 10_000,
  primary_pair: VERDICT_RULES.primary_pair,
  code_parity: "execute_args",
  known_op_observation: "cumulative_re_reads",
  comparison_metrics: [
    "weighted_tokens_median",
    "weighted_tokens_p90",
    "observation_tokens_over_ceiling",
    "task_success_rate",
    "turns_mean",
  ],
  verdict_rules: VERDICT_RULES,
  dual_model_claim_eligible: true,
  note:
    "Frozen before the first session. Blog/explainer claims must follow verdict_rules; do not re-interpret after seeing results.",
};
writeFileSync(join(STATE, "precommit.json"), JSON.stringify(precommit, null, 2) + "\n");
writeFileSync(
  join(ROOT, "docs/benchmarks/cloudflare-multiturn/fanout-join/real-model-cursor-gate-precommit.json"),
  JSON.stringify(precommit, null, 2) + "\n"
);

for (const model of MODELS) {
  for (const arm of ARMS) {
    mkdirSync(join(STATE, "sessions", model.label, arm), { recursive: true });
  }
}

const workflow = `# Fan-out Cursor real-model gate (blind)

Precommit revision: \`${REVISION}\`
Models: frontier=\`${PINNED.frontier}\` · small=\`${PINNED.small}\`
Iters: ${ITERS} per arm · Arms: ${ARMS.join(", ")}
Ordering: for each model, for i=1..${ITERS}, run known_op session i then program session i.

## Task

Produce one inventory card (field **types** matter):

- \`ssl\` (string), \`aRecordCount\` (**number** count of A records),
- \`workers\` (sorted id strings), \`routesForWorkers\` (join: routes whose script ∈ workers),
- \`bucketNames\` (sorted names), \`enabledFirewallRules\` (**number** count of non-paused rules — not an id list)

Count fields must be JSON numbers (use \`length(...)\` in \`where\`). An id array for a count field fails the checker.

Zone id / account id: see \`${STATE}/fixture-hint.json\`.

## Shared paths

- Fixture IDs: \`${STATE}/fixture-hint.json\`
- ClawQL MCP URL: \`${STATE}/mcp-url\` (currently ${clawql.mcpUrl})
- Known-op ops (no where): \`${STATE}/fanout-known-ops.json\`
- Execute schema: \`${STATE}/execute-tool-schema.json\`
- execute_program schema: \`${STATE}/execute-program-tool-schema.json\`

## CLI

\`\`\`bash
export CF_MT_REAL_MCP_URL=$(cat ${STATE}/mcp-url)
export CF_MT_REAL_CODE_PARITY=execute_args
CLI="node ${join(HERE, "lib/real-model-mcp-cli.mjs")}"
\`\`\`

### known_op

Six sequential \`execute\` calls. Use ops from \`fanout-known-ops.json\`; **you** write \`where\`.
Join \`routesForWorkers\` client-side after workers + routes observations.
Log: \`CF_MT_REAL_CALL_LOG=${STATE}/sessions/<model>/<arm>/session-<N>-calls.jsonl\`

FORBIDDEN: reading \`fanout-join-shapes.mjs\`, published-scripts, other sessions, or expected \`where\` strings.

### program

**One** \`execute_program\` with a JSON plan (\`return: true\` recommended for a compact card).
You invent call \`where\` / plan shape. Do not copy a published plan from the repo.
Prefer object \`where\` projections so counts stay numbers in the merged card.

## Outputs per session

- \`session-<N>.json\` — the inventory card object
- \`session-<N>-meta.json\` — \`{ok,turns,definitionTokens,whereAttempts,whereMalformed,toolErrors,cheated,notes,failed}\`
  - known_op: \`definitionTokens\` ≈ execute tool schema tokens; \`turns\` = execute rounds
  - program: \`definitionTokens\` ≈ execute_program tool schema tokens; \`turns\` = 1 if one program call
- \`session-<N>-calls.jsonl\` — CLI token log

Then: \`node ${join(HERE, "lib/check-fanout-real-session.mjs")} …/session-<N>.json\`

Aggregate: \`node ${join(HERE, "lib/aggregate-fanout-cursor-gate.mjs")} --state ${STATE}\`
`;

writeFileSync(join(STATE, "WORKFLOW.md"), workflow);

console.log(
  JSON.stringify(
    {
      state: STATE,
      precommit_wrote: join(STATE, "precommit.json"),
      repo_precommit:
        "docs/benchmarks/cloudflare-multiturn/fanout-join/real-model-cursor-gate-precommit.json",
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
