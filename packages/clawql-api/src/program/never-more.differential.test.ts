/**
 * "Never more" differential (ADR 0015 § Equivalence / differential test).
 *
 * For random tasks — reads plus one proposed write — the program path must never
 * end up more permissive than the same agent making individual execute calls:
 *
 *   permissions(program path) ⊆ permissions(step-by-step execute path)
 *
 * Programs may deny more (v0 rejects every non-`allow` write). The gateway below
 * mirrors execute-core's gate order — risk block → session IFC → mandate park →
 * side effect → accumulate read labels — using the production IFC functions; the
 * program path is the real plan runner on top of the same gateway.
 */

import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { labelForSpec } from "../ifc/labels.js";
import {
  accumulateSessionIfcReadSync,
  checkSessionIfcWriteSync,
  isReadOperation,
} from "../ifc/session-ifc-enforce.js";
import { clearAllSessionLabelsSync, getSessionLabelsSync } from "../ifc/session-label-store.js";
import { levelForPolicy, type OperationRiskPolicy } from "../risk/operation-risk-types.js";
import type { Operation } from "../spec/operation-types.js";
import { runProgramEffect, type ProgramHost } from "./program-runner.js";

/** denied < approval (mandate parked for Review) < allowed (ran with no human in the loop). */
type Permission = "denied" | "approval" | "allowed";
const RANK: Readonly<Record<Permission, number>> = { denied: 0, approval: 1, allowed: 2 };

type OpSpec = { readonly id: string; readonly method: string; readonly specLabel?: string };

const READ_OPS: readonly OpSpec[] = [
  { id: "github-internal.contracts.get", method: "GET", specLabel: "github-internal" },
  { id: "github.issues.list", method: "GET", specLabel: "github" },
  { id: "jira.issues.get", method: "GET", specLabel: "jira" },
  { id: "slack.conversations.history", method: "GET", specLabel: "slack" },
  { id: "status.incidents.list", method: "GET", specLabel: "public" },
  { id: "legacy.feed.get", method: "GET" },
];

const WRITE_OPS: readonly OpSpec[] = [
  { id: "slack.chat.postMessage", method: "POST", specLabel: "slack" },
  { id: "github.issues.create", method: "POST", specLabel: "github" },
  { id: "jira.issues.update", method: "PUT", specLabel: "jira" },
  { id: "status.incidents.create", method: "POST", specLabel: "public" },
  { id: "github.repos.delete", method: "DELETE", specLabel: "github" },
  { id: "webhook.relay.post", method: "POST" },
];

const IFC_ALLOWED_CONFIGS: readonly string[] = [
  JSON.stringify({ allowedSourcesByDest: { "source:slack": ["source:github", "source:jira"] } }),
  JSON.stringify({ allowedSourcesByDest: { "source:github": ["*"] } }),
  JSON.stringify({ publicDestinations: ["source:jira"] }),
];

const WRITE_CALL_ID = "proposed_write";

type ProgramSlot =
  | { readonly kind: "read"; readonly operationId: string }
  | { readonly kind: "search" }
  | { readonly kind: "write" };

type Task = {
  /** Reads earlier in the same session, before the program (individual calls on both paths). */
  readonly priorReads: readonly string[];
  /** Program call order. Step-by-step runs the same reads in order, then the write. */
  readonly program: readonly ProgramSlot[];
  /** Policy varies per task to model operator overrides (e.g. Slack posts allowlisted). */
  readonly write: { readonly operationId: string; readonly policy: OperationRiskPolicy };
  readonly mode: "parallel" | "sequential";
  /** Provider errors: a failed read returns no data, so it accumulates no label. */
  readonly failingReads: ReadonlySet<string>;
  /** Models CLAWQL_OPERATION_RISK_ENFORCE on the execute path. */
  readonly enforceRisk: boolean;
  readonly ifcAllowed?: string;
  readonly latencySeed: number;
};

type PathConfig = {
  readonly name: string;
  readonly programIfc: boolean;
  readonly stepIfc: boolean;
};

const CONFIGS: readonly PathConfig[] = [
  { name: "session IFC on for programs, off for step-by-step", programIfc: true, stepIfc: false },
  { name: "session IFC on for both paths", programIfc: true, stepIfc: true },
];

type PathOutcome = {
  readonly permission: Permission;
  readonly detail: string;
  readonly deniedByIfc: boolean;
  readonly readsAttempted: readonly string[];
  readonly writeRan: boolean;
  readonly storeLabels: readonly string[];
  readonly expectedLabels: readonly string[];
};

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toOperation(spec: OpSpec, policy: OperationRiskPolicy): Operation {
  return {
    id: spec.id,
    method: spec.method,
    path: `/${spec.id.replace(/\./g, "/")}`,
    flatPath: `/${spec.id.replace(/\./g, "/")}`,
    description: spec.id,
    resource: spec.id.split(".")[1] ?? spec.id,
    parameters: {},
    scopes: [],
    ...(spec.specLabel ? { specLabel: spec.specLabel } : {}),
    risk: {
      policy,
      level: levelForPolicy(policy),
      source: "override",
      reason: `never-more differential (${policy})`,
    },
  };
}

const programReads = (task: Task): string[] =>
  task.program.flatMap((slot) => (slot.kind === "read" ? [slot.operationId] : []));

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

type Gateway = {
  readonly execute: (operationId: string) => Effect.Effect<string>;
  readonly host: ProgramHost;
  readonly readsAttempted: string[];
  readonly writesRan: string[];
  /** Labels the production store should hold (successful reads while IFC is on). */
  readonly expectedLabels: Set<string>;
};

function makeGateway(task: Task, env: NodeJS.ProcessEnv, latencySeed: number): Gateway {
  const rnd = mulberry32(latencySeed);
  const catalog = new Map<string, Operation>();
  for (const spec of READ_OPS) catalog.set(spec.id, toOperation(spec, "allow"));
  for (const spec of WRITE_OPS) {
    if (spec.id === task.write.operationId)
      catalog.set(spec.id, toOperation(spec, task.write.policy));
  }
  const readsAttempted: string[] = [];
  const writesRan: string[] = [];
  const expectedLabels = new Set<string>();
  const ifcOn = env.CLAWQL_ENABLE_SESSION_IFC === "1";

  // Seeded scheduler yields stand in for spec-load and provider latency, so
  // parallel plans interleave the way concurrent network calls do.
  const latency = Effect.gen(function* () {
    const n = Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) yield* Effect.yieldNow;
  });

  const execute = (operationId: string): Effect.Effect<string> =>
    Effect.gen(function* () {
      yield* latency;
      const op = catalog.get(operationId);
      if (!op) return JSON.stringify({ error: `Unknown operationId: "${operationId}"` });
      const policy = op.risk?.policy;
      if (task.enforceRisk && policy === "block") {
        return JSON.stringify({ ok: false, status: "blocked", operationId });
      }
      const ifcBlock = checkSessionIfcWriteSync({ operation: op, env });
      if (ifcBlock) return JSON.stringify(ifcBlock);
      if (task.enforceRisk && policy === "mandate") {
        return JSON.stringify({ status: "mandate_required", operationId });
      }
      yield* latency;
      const read = isReadOperation(op);
      const success = !(read && task.failingReads.has(operationId));
      if (read) readsAttempted.push(operationId);
      else writesRan.push(operationId);
      if (read && success && ifcOn) expectedLabels.add(labelForSpec(op.specLabel));
      accumulateSessionIfcReadSync({ operation: op, success, env });
      return JSON.stringify(
        success
          ? { ok: true, operationId, data: [] }
          : { error: "provider unavailable", operationId }
      );
    });

  const host: ProgramHost = {
    execute: (input) =>
      execute(input.operationId).pipe(
        Effect.map((text) => ({ content: [{ type: "text" as const, text }] }))
      ),
    search: (input) =>
      Effect.succeed({
        formattedText: JSON.stringify({ ok: true, query: input.query, results: [] }),
      }),
    resolveRisk: (operationId) =>
      Effect.sync(() => {
        const op = catalog.get(operationId);
        return op
          ? { found: true, policy: op.risk?.policy, risk: op.risk, operation: op }
          : { found: false };
      }),
  };

  return { execute, host, readsAttempted, writesRan, expectedLabels };
}

function envFor(task: Task, ifc: boolean, sessionId: string): NodeJS.ProcessEnv {
  return {
    CLAWQL_SESSION_ID: sessionId,
    ...(ifc ? { CLAWQL_ENABLE_SESSION_IFC: "1" } : {}),
    ...(task.ifcAllowed ? { CLAWQL_SESSION_IFC_ALLOWED: task.ifcAllowed } : {}),
  };
}

function outcome(
  gw: Gateway,
  env: NodeJS.ProcessEnv,
  permission: Permission,
  detail: string,
  deniedByIfc: boolean
): PathOutcome {
  return {
    permission,
    detail,
    deniedByIfc,
    readsAttempted: [...gw.readsAttempted],
    writeRan: gw.writesRan.length > 0,
    storeLabels: sorted(getSessionLabelsSync(env.CLAWQL_SESSION_ID!)),
    expectedLabels: sorted(gw.expectedLabels),
  };
}

async function runStepByStep(task: Task, env: NodeJS.ProcessEnv): Promise<PathOutcome> {
  const gw = makeGateway(task, env, task.latencySeed);
  for (const id of [...task.priorReads, ...programReads(task)]) {
    await Effect.runPromise(gw.execute(id));
  }
  const text = await Effect.runPromise(gw.execute(task.write.operationId));
  const body = JSON.parse(text) as { ok?: boolean; status?: string; sessionLabels?: unknown };
  const permission: Permission =
    body.status === "mandate_required" ? "approval" : body.ok === true ? "allowed" : "denied";
  return outcome(gw, env, permission, body.status ?? "ok", Array.isArray(body.sessionLabels));
}

async function runProgramPath(task: Task, env: NodeJS.ProcessEnv): Promise<PathOutcome> {
  const gw = makeGateway(task, env, task.latencySeed ^ 0x9e3779b9);
  for (const id of task.priorReads) {
    await Effect.runPromise(gw.execute(id));
  }
  const calls = task.program.map((slot, i) => {
    if (slot.kind === "read") {
      return { tool: "execute", operationId: slot.operationId, args: {}, id: `read_${i}` };
    }
    if (slot.kind === "search") return { tool: "search", query: `context ${i}`, id: `search_${i}` };
    return {
      tool: "execute",
      operationId: task.write.operationId,
      args: { text: "summary of what the program read" },
      id: WRITE_CALL_ID,
    };
  });
  const out = await Effect.runPromise(
    runProgramEffect({ source: JSON.stringify({ v: 1, mode: task.mode, calls }) }, gw.host, env)
  );
  const record = out.calls.find((c) => c.id === WRITE_CALL_ID);
  const permission: Permission = !record
    ? "denied"
    : record.ok
      ? "allowed"
      : record.status === "mandate_required"
        ? "approval"
        : "denied";
  const detail = record?.status ?? (record?.ok ? "ok" : (out.diagnostics.error ?? "missing"));
  const deniedByIfc = !!record && !record.ok && /ifc|information-flow/i.test(record.error ?? "");
  return outcome(gw, env, permission, detail, deniedByIfc);
}

function randomTask(rnd: () => number): Task {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const priorReads = rnd() < 0.3 ? [pick(READ_OPS).id] : [];
  const reads = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(READ_OPS).id);
  const program: ProgramSlot[] = reads.map((operationId) => ({ kind: "read", operationId }));
  if (rnd() < 0.3) program.splice(Math.floor(rnd() * (program.length + 1)), 0, { kind: "search" });
  program.splice(Math.floor(rnd() * (program.length + 1)), 0, { kind: "write" });
  const policies: readonly OperationRiskPolicy[] = ["allow", "allow", "mandate", "block"];
  return {
    priorReads,
    program,
    write: { operationId: pick(WRITE_OPS).id, policy: pick(policies) },
    mode: rnd() < 0.5 ? "parallel" : "sequential",
    failingReads: new Set(reads.filter(() => rnd() < 0.1)),
    enforceRisk: rnd() < 0.5,
    ifcAllowed: rnd() < 0.25 ? pick(IFC_ALLOWED_CONFIGS) : undefined,
    latencySeed: Math.floor(rnd() * 2 ** 32),
  };
}

function describeCase(label: string, task: Task, step: PathOutcome, program: PathOutcome): string {
  const slots = task.program
    .map((s) => (s.kind === "read" ? s.operationId : s.kind === "search" ? "search" : "WRITE"))
    .join(", ");
  return (
    `${label} mode=${task.mode} prior=[${task.priorReads.join(", ")}] program=[${slots}] ` +
    `write=${task.write.operationId}(${task.write.policy}) enforceRisk=${task.enforceRisk} ` +
    `failing=[${[...task.failingReads].join(", ")}] allowed=${task.ifcAllowed ?? "-"} → ` +
    `step=${step.permission}(${step.detail}) program=${program.permission}(${program.detail})`
  );
}

/** Every property the paths must satisfy; returns human-readable violations. */
function checkNeverMore(
  label: string,
  config: PathConfig,
  task: Task,
  step: PathOutcome,
  program: PathOutcome
): string[] {
  const where = describeCase(label, task, step, program);
  const violations: string[] = [];
  if (RANK[program.permission] > RANK[step.permission]) {
    violations.push(`program more permissive than step-by-step: ${where}`);
  }
  if (program.permission !== "allowed" && program.writeRan) {
    violations.push(`program write side effect ran although denied: ${where}`);
  }
  if (step.permission !== "allowed" && step.writeRan) {
    violations.push(`step-by-step write side effect ran although denied: ${where}`);
  }
  if (sorted(program.readsAttempted).join() !== sorted(step.readsAttempted).join()) {
    violations.push(
      `reads differ (program [${program.readsAttempted.join(", ")}] vs step [${step.readsAttempted.join(", ")}]): ${where}`
    );
  }
  for (const [path, o] of [
    ["program", program],
    ["step", step],
  ] as const) {
    if (o.storeLabels.join() !== o.expectedLabels.join()) {
      violations.push(
        `${path} session labels [${o.storeLabels.join(", ")}] ≠ successful reads [${o.expectedLabels.join(", ")}]: ${where}`
      );
    }
  }
  // Same reads under session labeling ⇒ same labels ⇒ same IFC decision. v0 still
  // rejects every non-`allow` write and pre-checks planned reads (even ones that
  // later fail), so equality is only claimed where neither applies.
  const honestEquality =
    config.programIfc &&
    config.stepIfc &&
    task.write.policy === "allow" &&
    task.failingReads.size === 0;
  if (honestEquality && program.permission !== step.permission) {
    violations.push(`expected equal decisions under session labeling: ${where}`);
  }
  return violations;
}

afterEach(() => {
  clearAllSessionLabelsSync();
});

describe("never-more differential: program ⊆ step-by-step execute (ADR 0015)", () => {
  const ITERATIONS = 200;

  for (const [configIndex, config] of CONFIGS.entries()) {
    it(`holds on ${ITERATIONS} random tasks — ${config.name}`, async () => {
      const rnd = mulberry32(0x0015_0e5e + configIndex);
      const violations: string[] = [];
      const stats = { equal: 0, programDeniedMore: 0, bothAllowed: 0, launderingCaught: 0 };

      for (let i = 0; i < ITERATIONS; i++) {
        const task = randomTask(rnd);
        const step = await runStepByStep(task, envFor(task, config.stepIfc, `nm-${i}-step`));
        const program = await runProgramPath(
          task,
          envFor(task, config.programIfc, `nm-${i}-program`)
        );
        violations.push(...checkNeverMore(`#${i}`, config, task, step, program));

        if (program.permission === step.permission) stats.equal += 1;
        else stats.programDeniedMore += 1;
        if (program.permission === "allowed" && step.permission === "allowed") {
          stats.bothAllowed += 1;
        }
        if (program.permission === "denied" && (program.deniedByIfc || step.deniedByIfc)) {
          stats.launderingCaught += 1;
        }
      }

      expect(violations.slice(0, 5)).toEqual([]);
      // Non-vacuity: the generator must reach allowed, stricter, and IFC-denied cases.
      expect(stats.bothAllowed).toBeGreaterThan(0);
      expect(stats.programDeniedMore).toBeGreaterThan(0);
      expect(stats.launderingCaught).toBeGreaterThan(0);
    });
  }
});

type FixtureExpectation = { readonly step: Permission; readonly program: Permission };

type Fixture = {
  readonly name: string;
  readonly priorReads?: readonly string[];
  readonly reads: readonly string[];
  readonly write: Task["write"];
  readonly failingReads?: readonly string[];
  readonly enforceRisk?: boolean;
  readonly ifcAllowed?: string;
  /** Keyed by {@link CONFIGS} index: [programs on / step off, both on]. */
  readonly expected: readonly [FixtureExpectation, FixtureExpectation];
};

const SLACK_ALLOWLISTED = { operationId: "slack.chat.postMessage", policy: "allow" } as const;

const FIXTURES: readonly Fixture[] = [
  {
    name: "laundering: read an internal GitHub contract, then post to Slack (allowlisted)",
    reads: ["github-internal.contracts.get"],
    write: SLACK_ALLOWLISTED,
    expected: [
      { step: "allowed", program: "denied" },
      { step: "denied", program: "denied" },
    ],
  },
  {
    name: "laundering via the session: internal read first, then a Slack-only program",
    priorReads: ["github-internal.contracts.get"],
    reads: [],
    write: SLACK_ALLOWLISTED,
    expected: [
      { step: "allowed", program: "denied" },
      { step: "denied", program: "denied" },
    ],
  },
  {
    name: "laundering through mixed reads: Slack history plus an internal contract",
    reads: ["slack.conversations.history", "github-internal.contracts.get"],
    write: SLACK_ALLOWLISTED,
    expected: [
      { step: "allowed", program: "denied" },
      { step: "denied", program: "denied" },
    ],
  },
  {
    name: "same-source write after reading that source",
    reads: ["github.issues.list"],
    write: { operationId: "github.issues.create", policy: "allow" },
    expected: [
      { step: "allowed", program: "allowed" },
      { step: "allowed", program: "allowed" },
    ],
  },
  {
    name: "public destination accepts any label",
    reads: ["github-internal.contracts.get"],
    write: { operationId: "status.incidents.create", policy: "allow" },
    expected: [
      { step: "allowed", program: "allowed" },
      { step: "allowed", program: "allowed" },
    ],
  },
  {
    name: "unknown sink fails closed once the session is tainted",
    reads: ["github.issues.list"],
    write: { operationId: "webhook.relay.post", policy: "allow" },
    expected: [
      { step: "allowed", program: "denied" },
      { step: "denied", program: "denied" },
    ],
  },
  {
    name: "allow-list lets GitHub flow to Slack",
    reads: ["github.issues.list"],
    write: SLACK_ALLOWLISTED,
    ifcAllowed: IFC_ALLOWED_CONFIGS[0],
    expected: [
      { step: "allowed", program: "allowed" },
      { step: "allowed", program: "allowed" },
    ],
  },
  {
    name: "allow-list does not cover the internal source",
    reads: ["github.issues.list", "github-internal.contracts.get"],
    write: SLACK_ALLOWLISTED,
    ifcAllowed: IFC_ALLOWED_CONFIGS[0],
    expected: [
      { step: "allowed", program: "denied" },
      { step: "denied", program: "denied" },
    ],
  },
  {
    name: "mandate write: step-by-step parks it for Review, a v0 program rejects it",
    reads: ["jira.issues.get"],
    write: { operationId: "jira.issues.update", policy: "mandate" },
    enforceRisk: true,
    expected: [
      { step: "approval", program: "denied" },
      { step: "approval", program: "denied" },
    ],
  },
  {
    name: "blocked write is denied on both paths",
    reads: ["github.issues.list"],
    write: { operationId: "github.repos.delete", policy: "block" },
    enforceRisk: true,
    expected: [
      { step: "denied", program: "denied" },
      { step: "denied", program: "denied" },
    ],
  },
  {
    name: "failed internal read: step-by-step carries no label, the program stays conservative",
    reads: ["github-internal.contracts.get"],
    failingReads: ["github-internal.contracts.get"],
    write: SLACK_ALLOWLISTED,
    expected: [
      { step: "allowed", program: "denied" },
      { step: "allowed", program: "denied" },
    ],
  },
];

/** Plan shapes that must not change the decision: both modes, write first and last. */
const SHAPES = [
  { mode: "parallel", writeFirst: true },
  { mode: "parallel", writeFirst: false },
  { mode: "sequential", writeFirst: true },
  { mode: "sequential", writeFirst: false },
] as const;

describe("never-more fixtures", () => {
  for (const fixture of FIXTURES) {
    it(fixture.name, async () => {
      const violations: string[] = [];
      for (const [configIndex, config] of CONFIGS.entries()) {
        for (const [shapeIndex, shape] of SHAPES.entries()) {
          const readSlots: ProgramSlot[] = fixture.reads.map((operationId) => ({
            kind: "read",
            operationId,
          }));
          const task: Task = {
            priorReads: fixture.priorReads ?? [],
            program: shape.writeFirst
              ? [{ kind: "write" }, ...readSlots]
              : [...readSlots, { kind: "write" }],
            write: fixture.write,
            mode: shape.mode,
            failingReads: new Set(fixture.failingReads ?? []),
            enforceRisk: fixture.enforceRisk ?? false,
            ifcAllowed: fixture.ifcAllowed,
            latencySeed: 0xf1c5 + shapeIndex,
          };
          const key = `fx-${configIndex}-${shapeIndex}`;
          const step = await runStepByStep(task, envFor(task, config.stepIfc, `${key}-step`));
          const program = await runProgramPath(
            task,
            envFor(task, config.programIfc, `${key}-program`)
          );
          const label = `[${config.name} | ${shape.mode}, write ${shape.writeFirst ? "first" : "last"}]`;
          violations.push(...checkNeverMore(label, config, task, step, program));
          const want = fixture.expected[configIndex]!;
          if (step.permission !== want.step || program.permission !== want.program) {
            violations.push(
              `expected step=${want.step} program=${want.program}: ${describeCase(label, task, step, program)}`
            );
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
