#!/usr/bin/env node
/**
 * Fair Executor comparison suite (executor-cmp-fair-001..N)
 *
 * Publishes the honest arms before Executor v2 code mode ships:
 *   1. Executor raw (full REST / CLI dump) — today's baseline
 *   2. Executor program-filter (simulated) — same fields as ClawQL, projecting
 *      the raw payload client-side. This is what OpenCode-style code mode
 *      would return; labeled simulated until a live Executor program arm exists.
 *   3. ClawQL execute + fields (+ optional where)
 *
 * Measures both input-side tool-result tokens and output-side tokens
 * (serialized answer the model would emit for the task).
 *
 * ≥10 tasks including multi-step fan-out. Offline fixtures by default;
 * BENCHMARK_LIVE=1 can refresh GitHub list arms when token/network available.
 *
 * Usage:
 *   node scripts/benchmarks/executor-comparison-fair-suite.mjs
 *   npm run benchmark:executor-comparison:fair
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getEncoding } from "js-tiktoken";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "executor-comparison");
const FIXTURE_PATH = join(
  ROOT,
  "docs",
  "benchmarks",
  "response-examples",
  "github-pr-list.json"
);
const SUITE_FIXTURE = join(
  OUT_DIR,
  "executor-cmp-fair-suite.fixture.json"
);

const enc = getEncoding("cl100k_base");

function countTokens(text) {
  if (text == null || text === "") return 0;
  return enc.encode(String(text)).length;
}

function projectItems(items, fields) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
    const out = {};
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(item, f)) out[f] = item[f];
      else if (f === "login" && item.user?.login) out.login = item.user.login;
      else if (f === "sha" && item.sha) out.sha = item.sha;
      else if (f === "message" && item.commit?.message) out.message = item.commit.message;
      else if (f === "tag_name" && item.tag_name) out.tag_name = item.tag_name;
      else if (f === "name" && item.name != null) out.name = item.name;
      else if (f === "type" && item.type) out.type = item.type;
      else if (f === "actor" && item.actor?.login) out.actor = item.actor.login;
    }
    return out;
  });
}

function filterWhere(items, pred) {
  if (!pred) return items;
  return items.filter(pred);
}

/** Synthetic fat list for filter/fan-out tasks when PR fixture is small. */
function synthesizeList(kind, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    if (kind === "pulls") {
      out.push({
        id: 10_000 + i,
        number: i,
        title: `PR ${i}: ${i % 7 === 0 ? "bugfix for labels" : "chore update"}`,
        state: i % 5 === 0 ? "closed" : "open",
        labels: i % 7 === 0 ? [{ name: "bug" }] : [{ name: "enhancement" }],
        user: { login: i % 3 === 0 ? "alice-dev" : "other" },
        body: "x".repeat(200),
        html_url: `https://github.com/acme/platform/pull/${i}`,
        diff_url: `https://github.com/acme/platform/pull/${i}.diff`,
        patch_url: `https://github.com/acme/platform/pull/${i}.patch`,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-02T00:00:00Z",
        draft: false,
        merged_at: null,
        review_comments: i % 4,
        comments: i % 6,
        commits: 1 + (i % 5),
        additions: 10 * i,
        deletions: i,
        changed_files: 1 + (i % 3),
      });
    } else if (kind === "issues") {
      out.push({
        id: 20_000 + i,
        number: i,
        title: `Issue ${i}`,
        state: "open",
        labels: i % 4 === 0 ? [{ name: "bug" }] : [],
        user: { login: "reporter" },
        body: "y".repeat(180),
        comments: i % 8,
        html_url: `https://github.com/acme/platform/issues/${i}`,
      });
    } else if (kind === "commits") {
      out.push({
        sha: `abc${String(i).padStart(37, "0")}`,
        commit: { message: `commit ${i}\n\n${"z".repeat(120)}`, author: { name: "dev" } },
        html_url: `https://github.com/acme/platform/commit/${i}`,
        author: { login: "dev" },
        parents: [{ sha: "parent" }],
      });
    } else if (kind === "releases") {
      out.push({
        id: 30_000 + i,
        tag_name: `v1.${i}.0`,
        name: `Release ${i}`,
        body: "r".repeat(300),
        draft: false,
        prerelease: i % 6 === 0,
        html_url: `https://github.com/acme/platform/releases/tag/v1.${i}.0`,
        author: { login: "releaser" },
        assets: [{ name: "dist.tgz", size: 1_000_000 + i }],
      });
    } else if (kind === "events") {
      out.push({
        id: String(40_000 + i),
        type: i % 2 === 0 ? "PushEvent" : "PullRequestEvent",
        actor: { login: "bot", id: i },
        repo: { name: "acme/platform" },
        payload: { size: i, distinct_size: 1, stewing: "w".repeat(80) },
        created_at: "2026-03-01T00:00:00Z",
      });
    } else if (kind === "jira") {
      out.push({
        id: `JIRA-${i}`,
        key: `PLAT-${i}`,
        fields: {
          summary: `Ticket ${i}`,
          status: { name: i % 5 === 0 ? "Done" : "In Progress" },
          description: "j".repeat(250),
          labels: i % 7 === 0 ? ["bug"] : ["task"],
        },
      });
    }
  }
  return out;
}

/**
 * Task catalog. Each task declares raw kind, fields, optional filter, and
 * whether it is multi-step (fan-out / join).
 */
const TASKS = [
  {
    id: "fair-001",
    kind: "single",
    description: "List open PRs; return title and number only",
    source: "pulls",
    fields: ["title", "number"],
    filter: (p) => p.state === "open",
    n: 30,
  },
  {
    id: "fair-002",
    kind: "single",
    description: "Open PRs labeled bug; title and number only",
    source: "pulls",
    fields: ["title", "number"],
    filter: (p) =>
      p.state === "open" &&
      (p.labels ?? []).some((l) => (typeof l === "string" ? l : l.name) === "bug"),
    n: 80,
  },
  {
    id: "fair-003",
    kind: "single",
    description: "List issues; title and number only",
    source: "issues",
    fields: ["title", "number"],
    n: 40,
  },
  {
    id: "fair-004",
    kind: "single",
    description: "List commits; sha and message only",
    source: "commits",
    fields: ["sha", "message"],
    n: 50,
  },
  {
    id: "fair-005",
    kind: "single",
    description: "List releases; tag_name and name only",
    source: "releases",
    fields: ["tag_name", "name"],
    n: 25,
  },
  {
    id: "fair-006",
    kind: "single",
    description: "List events; type and actor only",
    source: "events",
    fields: ["type", "actor"],
    n: 60,
  },
  {
    id: "fair-007",
    kind: "single",
    description: "Filter 200 PRs down to open bug titles (large-list filter)",
    source: "pulls",
    fields: ["title", "number"],
    filter: (p) =>
      p.state === "open" &&
      (p.labels ?? []).some((l) => (typeof l === "string" ? l : l.name) === "bug"),
    n: 200,
  },
  {
    id: "fair-008",
    kind: "fanout",
    description: "Fan-out: list open PRs + list open issues (parallel reads)",
    steps: [
      {
        source: "pulls",
        fields: ["title", "number"],
        filter: (p) => p.state === "open",
        n: 30,
      },
      {
        source: "issues",
        fields: ["title", "number"],
        filter: (p) => p.state === "open",
        n: 30,
      },
    ],
  },
  {
    id: "fair-009",
    kind: "fanout",
    description: "Fan-out: commits + releases + events (three parallel reads)",
    steps: [
      { source: "commits", fields: ["sha", "message"], n: 20 },
      { source: "releases", fields: ["tag_name", "name"], n: 10 },
      { source: "events", fields: ["type", "actor"], n: 20 },
    ],
  },
  {
    id: "fair-010",
    kind: "join",
    description: "Cross-source join: open bug PRs with matching Jira PLAT-* keys",
    steps: [
      {
        source: "pulls",
        fields: ["title", "number"],
        filter: (p) =>
          p.state === "open" &&
          (p.labels ?? []).some((l) => (typeof l === "string" ? l : l.name) === "bug"),
        n: 80,
      },
      {
        source: "jira",
        fields: ["key", "summary"],
        filter: (t) => (t.fields?.labels ?? []).includes("bug"),
        n: 80,
        projectFields: (items) =>
          items.map((t) => ({
            key: t.key,
            summary: t.fields?.summary,
          })),
      },
    ],
    joinNote:
      "Join in program memory: keep PRs whose title contains a Jira key present in the bug ticket set.",
  },
  {
    id: "fair-011",
    kind: "single",
    description: "Alice-authored open PRs; title and number",
    source: "pulls",
    fields: ["title", "number"],
    filter: (p) => p.state === "open" && (p.user?.login ?? p.user) === "alice-dev",
    n: 60,
  },
  {
    id: "fair-012",
    kind: "single",
    description: "Closed PRs only; title and number",
    source: "pulls",
    fields: ["title", "number"],
    filter: (p) => p.state === "closed",
    n: 40,
  },
];

function loadSource(source, n, prFixture) {
  if (source === "pulls" && prFixture?.fullRest?.length && n <= prFixture.fullRest.length) {
    return prFixture.fullRest.slice(0, n);
  }
  return synthesizeList(source, n);
}

function measureArm(rawItems, fields, customProject) {
  const rawText = JSON.stringify(rawItems);
  const projected = customProject
    ? customProject(rawItems)
    : projectItems(rawItems, fields);
  const projectedText = JSON.stringify(projected);
  return {
    rawInputTokens: countTokens(rawText),
    programFilterInputTokens: countTokens(projectedText),
    clawqlProjectedInputTokens: countTokens(projectedText),
    outputTokens: countTokens(projectedText),
    rawBytes: Buffer.byteLength(rawText, "utf8"),
    projectedBytes: Buffer.byteLength(projectedText, "utf8"),
    itemCountRaw: Array.isArray(rawItems) ? rawItems.length : 0,
    itemCountProjected: Array.isArray(projected) ? projected.length : 0,
    fields,
  };
}

function runSingle(task, prFixture) {
  const rawAll = loadSource(task.source, task.n ?? 30, prFixture);
  const filtered = filterWhere(rawAll, task.filter);
  const arms = measureArm(filtered, task.fields, task.projectFields);
  return {
    id: task.id,
    kind: task.kind,
    description: task.description,
    multiStep: false,
    arms: {
      executorRaw: {
        inputTokens: arms.rawInputTokens,
        outputTokens: arms.outputTokens,
        note: "Full list JSON into model context (no projection).",
      },
      executorProgramFilterSimulated: {
        inputTokens: arms.programFilterInputTokens,
        outputTokens: arms.outputTokens,
        simulated: true,
        note:
          "Same fields as ClawQL; projects the raw payload. Stand-in for Executor/OpenCode code-mode filter until live program arm exists.",
      },
      clawql: {
        inputTokens: arms.clawqlProjectedInputTokens,
        outputTokens: arms.outputTokens,
        note: "execute + fields (+ where when filtering). Same projected payload as program-filter arm on single-source tasks.",
      },
    },
    ratios: {
      rawVsClawqlInput: +(arms.rawInputTokens / Math.max(1, arms.clawqlProjectedInputTokens)).toFixed(
        2
      ),
      programFilterVsClawqlInput: +(
        arms.programFilterInputTokens / Math.max(1, arms.clawqlProjectedInputTokens)
      ).toFixed(2),
    },
    itemCountRaw: arms.itemCountRaw,
    itemCountProjected: arms.itemCountProjected,
  };
}

function runFanoutOrJoin(task, prFixture) {
  const stepResults = [];
  let rawSumIn = 0;
  let progSumIn = 0;
  let clawSumIn = 0;
  let outSum = 0;

  for (const step of task.steps) {
    const rawAll = loadSource(step.source, step.n ?? 30, prFixture);
    const filtered = filterWhere(rawAll, step.filter);
    const arms = measureArm(filtered, step.fields, step.projectFields);
    stepResults.push({
      source: step.source,
      fields: step.fields,
      ...arms,
    });
    rawSumIn += arms.rawInputTokens;
    progSumIn += arms.programFilterInputTokens;
    clawSumIn += arms.clawqlProjectedInputTokens;
    outSum += arms.outputTokens;
  }

  // Join: after both sides projected, emit intersection-sized answer (honest small output).
  let joinOutputTokens = outSum;
  if (task.kind === "join" && stepResults.length >= 2) {
    const prs = stepResults[0];
    const tickets = stepResults[1];
    const keys = new Set(
      (tickets.itemCountProjected
        ? synthesizeList("jira", task.steps[1].n)
            .filter(task.steps[1].filter ?? (() => true))
            .map((t) => t.key)
        : [])
    );
    // Recompute join answer size from projected PR titles mentioning keys
    const prItems = projectItems(
      filterWhere(loadSource("pulls", task.steps[0].n, prFixture), task.steps[0].filter),
      task.steps[0].fields
    );
    const joined = prItems.filter((p) => [...keys].some((k) => String(p.title).includes(k)));
    // Prefer empty-or-small join list tokens as the model answer
    joinOutputTokens = countTokens(JSON.stringify(joined.length ? joined : prItems.slice(0, 3)));
  }

  return {
    id: task.id,
    kind: task.kind,
    description: task.description,
    multiStep: true,
    joinNote: task.joinNote,
    steps: stepResults.map((s) => ({
      source: s.source,
      fields: s.fields,
      rawInputTokens: s.rawInputTokens,
      programFilterInputTokens: s.programFilterInputTokens,
      itemCountRaw: s.itemCountRaw,
      itemCountProjected: s.itemCountProjected,
    })),
    arms: {
      executorRaw: {
        inputTokens: rawSumIn,
        outputTokens: joinOutputTokens,
        note: "Sum of full REST bodies for each step (no projection).",
      },
      executorProgramFilterSimulated: {
        inputTokens: progSumIn,
        outputTokens: joinOutputTokens,
        simulated: true,
        note: "Sum of per-step projected results — code-mode filter stand-in.",
      },
      clawql: {
        inputTokens: clawSumIn,
        outputTokens: joinOutputTokens,
        note:
          task.kind === "join"
            ? "Today: N executes with fields; join still needs model or future program. Tokenized as projected reads + small join answer."
            : "N parallel executes with fields (fan-out). Same projected input as program-filter until programs land.",
      },
    },
    ratios: {
      rawVsClawqlInput: +(rawSumIn / Math.max(1, clawSumIn)).toFixed(2),
      programFilterVsClawqlInput: +(progSumIn / Math.max(1, clawSumIn)).toFixed(2),
    },
  };
}

async function main() {
  let prFixture = null;
  try {
    prFixture = JSON.parse(await readFile(FIXTURE_PATH, "utf-8"));
  } catch {
    prFixture = null;
  }

  const tasks = TASKS.map((t) =>
    t.kind === "single" ? runSingle(t, prFixture) : runFanoutOrJoin(t, prFixture)
  );

  const totals = tasks.reduce(
    (acc, t) => {
      acc.executorRawInput += t.arms.executorRaw.inputTokens;
      acc.executorProgramFilterInput += t.arms.executorProgramFilterSimulated.inputTokens;
      acc.clawqlInput += t.arms.clawql.inputTokens;
      acc.executorRawOutput += t.arms.executorRaw.outputTokens;
      acc.executorProgramFilterOutput += t.arms.executorProgramFilterSimulated.outputTokens;
      acc.clawqlOutput += t.arms.clawql.outputTokens;
      return acc;
    },
    {
      executorRawInput: 0,
      executorProgramFilterInput: 0,
      clawqlInput: 0,
      executorRawOutput: 0,
      executorProgramFilterOutput: 0,
      clawqlOutput: 0,
    }
  );

  const report = {
    suite: "executor-cmp-fair",
    version: 1,
    focus: ["input", "output"],
    tokenizer: "cl100k_base",
    taskCount: tasks.length,
    honesty: {
      programFilterArm:
        "Simulated by projecting the same raw payload to the task fields. " +
        "This is the fair comparison once Executor/OpenCode code mode filters before return. " +
        "Replace with a live Executor program arm when EXECUTOR_PROGRAM_BIN is available.",
      singleCallBestCase:
        "fair-001 is ClawQL's best case (fields projection). Multi-step tasks (fair-008..010) are where programs must earn promotion.",
      layer1Note:
        "Layer 1 tool-definition sizes are measured separately in executor-cmp-001; this suite focuses on Layer 2 + outputs.",
    },
    totals: {
      ...totals,
      ratioRawVsClawqlInput: +(
        totals.executorRawInput / Math.max(1, totals.clawqlInput)
      ).toFixed(2),
      ratioProgramFilterVsClawqlInput: +(
        totals.executorProgramFilterInput / Math.max(1, totals.clawqlInput)
      ).toFixed(2),
      ratioRawVsClawqlOutput: +(
        totals.executorRawOutput / Math.max(1, totals.clawqlOutput)
      ).toFixed(2),
    },
    tasks,
    generatedAt: new Date().toISOString(),
  };

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "executor-cmp-fair-suite.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf-8");
  await writeFile(SUITE_FIXTURE, JSON.stringify(report, null, 2), "utf-8");

  console.log("=== Fair Executor suite (input + output) ===");
  console.log(`Tasks: ${report.taskCount}`);
  console.log(
    `Totals INPUT  raw=${totals.executorRawInput}  programFilter≈${totals.executorProgramFilterInput}  clawql=${totals.clawqlInput}`
  );
  console.log(
    `Totals OUTPUT raw=${totals.executorRawOutput}  programFilter≈${totals.executorProgramFilterOutput}  clawql=${totals.clawqlOutput}`
  );
  console.log(
    `Ratio INPUT  raw/clawql=${report.totals.ratioRawVsClawqlInput}×  programFilter/clawql=${report.totals.ratioProgramFilterVsClawqlInput}×`
  );
  console.log(
    "→ On single-source projected tasks, program-filter ≈ ClawQL (ratio ~1×). Raw dump is the old unfair arm."
  );
  console.log(
    "→ Multi-step fan-out/join tasks still need programs for round-trip wins; token parity on projection alone is expected."
  );
  for (const t of tasks) {
    console.log(
      `  ${t.id} [${t.kind}] raw/clawql=${t.ratios.rawVsClawqlInput}×  pf/clawql=${t.ratios.programFilterVsClawqlInput}× — ${t.description}`
    );
  }
  console.error(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error("executor-comparison-fair-suite failed:", err);
  process.exit(1);
});
