import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  accumulateSessionLabelsSync,
  clearAllSessionLabelsSync,
} from "../ifc/session-label-store.js";
import { hashPendingArgsEffect } from "../pending/args-hash.js";
import type { OperationRiskPolicy } from "../risk/operation-risk-types.js";
import { parseProgramPlanEffect, type ProgramPlan } from "./program-plan.js";
import {
  currentProgramProposalStoreEffect,
  makeProgramProposalStoreLayer,
} from "./program-proposal-store.js";
import type { ResolvedProposal } from "./program-proposals.js";
import { runProgramEffect, type ExecuteProgramResult, type ProgramHost } from "./program-runner.js";

type MockOp = {
  readonly policy: OperationRiskPolicy;
  readonly specLabel?: string;
  readonly method?: string;
  /** Omit operation info from resolveRisk (host without IFC data). */
  readonly bare?: boolean;
};

function proposalHost(
  ops: Record<string, MockOp>,
  results: Record<string, unknown> = {}
): { readonly host: ProgramHost; readonly executed: string[] } {
  const executed: string[] = [];
  const host: ProgramHost = {
    execute: (input) =>
      Effect.sync(() => {
        executed.push(input.operationId);
        const body = results[input.operationId] ?? { ok: true };
        return { content: [{ type: "text" as const, text: JSON.stringify(body) }] };
      }),
    search: (input) =>
      Effect.succeed({ formattedText: JSON.stringify({ ok: true, query: input.query }) }),
    resolveRisk: (operationId) => {
      const op = ops[operationId];
      if (!op) return Effect.succeed({ found: false });
      const method = op.method ?? (op.policy === "allow" ? "GET" : "POST");
      return Effect.succeed({
        found: true,
        policy: op.policy,
        risk: {
          policy: op.policy,
          level: op.policy === "allow" ? ("LOW" as const) : ("MEDIUM" as const),
          source: "spec-default" as const,
          reason: `mock ${op.policy}`,
        },
        ...(op.bare ? {} : { operation: { id: operationId, method, specLabel: op.specLabel } }),
      });
    },
  };
  return { host, executed };
}

const OPS: Record<string, MockOp> = {
  "issues.get": { policy: "allow", specLabel: "github" },
  "issues.create": { policy: "mandate", specLabel: "github" },
  "issues.createComment": { policy: "mandate", specLabel: "github" },
  "crm.contract.get": { policy: "allow", specLabel: "crm" },
  "slack.post": { policy: "mandate", specLabel: "slack" },
};

const run = (
  plan: unknown,
  host: ProgramHost,
  env: NodeJS.ProcessEnv = {}
): Promise<ExecuteProgramResult> =>
  Effect.runPromise(
    runProgramEffect({ source: JSON.stringify(plan) }, host, env).pipe(
      Effect.provide(makeProgramProposalStoreLayer())
    )
  );

const proposalsOf = (out: ExecuteProgramResult): readonly ResolvedProposal[] =>
  (out.result as { proposals: readonly ResolvedProposal[] }).proposals;

const parse = (plan: unknown) => Effect.runPromise(parseProgramPlanEffect(JSON.stringify(plan)));

function parseErrorOf(value: unknown): string {
  expect(value).toMatchObject({ ok: false });
  return (value as { error: string }).error;
}

afterEach(() => {
  clearAllSessionLabelsSync();
});

describe("parseProgramPlanEffect — proposals", () => {
  it("parses proposals after reads, with default ids and ref sites", async () => {
    const plan = (await parse({
      v: 1,
      mode: "sequential",
      calls: [{ id: "A", tool: "execute", operationId: "issues.get", args: { n: 1 } }],
      proposals: [
        { id: "W1", operationId: "issues.create", args: { title: { $ref: "A.result.title" } } },
        { operationId: "issues.createComment", args: { body: "x" }, fields: ["id"] },
      ],
    })) as ProgramPlan;
    const proposals = plan.proposals ?? [];
    expect(plan.calls[0]!.id).toBe("A");
    expect(proposals.map((p) => p.id)).toEqual(["W1", "proposal_1"]);
    expect(proposals[0]!.refs).toEqual([
      {
        at: "/title",
        ref: { raw: "A.result.title", target: "A", root: "result", path: ["title"] },
      },
    ]);
    expect(proposals[1]!.fields).toEqual(["id"]);
  });

  it("allows a proposals-only plan", async () => {
    const plan = (await parse({
      v: 1,
      proposals: [{ id: "W1", operationId: "issues.create", args: {} }],
    })) as ProgramPlan;
    expect(plan.calls).toEqual([]);
    expect(plan.proposals).toHaveLength(1);
  });

  it("still tolerates repeated call ids when there are no proposals", async () => {
    const plan = (await parse({
      calls: [
        { id: "a", tool: "execute", operationId: "issues.get" },
        { id: "a", tool: "execute", operationId: "issues.get" },
      ],
    })) as ProgramPlan;
    expect(plan.calls).toHaveLength(2);
  });

  it.each([
    [{ proposals: {} }, "plan.proposals must be an array"],
    [{ proposals: [{ operationId: "x", tool: "search" }] }, 'tool must be "execute"'],
    [{ proposals: [{ args: {} }] }, "operationId required"],
    [{ proposals: [{ id: "W.1", operationId: "x" }] }, "id must match"],
    [{ proposals: [{ id: "W1", operationId: "x", args: [] }] }, "args must be an object"],
    [
      { proposals: [{ id: "W1", operationId: "x", args: { a: { $ref: "Z.result.id" } } }] },
      'targets unknown id "Z"',
    ],
    [
      {
        proposals: [
          { id: "W1", operationId: "x", args: { a: { $ref: "W2.result.id" } } },
          { id: "W2", operationId: "x" },
        ],
      },
      "must point at an earlier proposal",
    ],
    [
      { proposals: [{ id: "W1", operationId: "x", args: { a: { $ref: "W1.args.b" } } }] },
      "must point at an earlier proposal",
    ],
    [
      {
        calls: [{ id: "A", tool: "execute", operationId: "issues.get" }],
        proposals: [{ id: "W1", operationId: "x", args: { a: { $ref: "A.args.n" } } }],
      },
      "read calls expose only .result",
    ],
    [
      {
        calls: [{ id: "W1", tool: "execute", operationId: "issues.get" }],
        proposals: [{ id: "W1", operationId: "x" }],
      },
      'duplicate id "W1"',
    ],
    [
      {
        calls: [{ tool: "execute", operationId: "issues.get", args: { a: { $ref: "W1.result" } } }],
        proposals: [],
      },
      "contains a $ref placeholder",
    ],
  ])("rejects %j", async (plan, fragment) => {
    expect(parseErrorOf(await parse({ v: 1, calls: [], ...plan }))).toContain(fragment);
  });
});

describe("execute_program — proposed writes", () => {
  it("returns resolved proposals and never executes them", async () => {
    const { host, executed } = proposalHost(OPS, {
      "issues.get": { number: 7, title: "Flaky test", labels: ["bug"] },
    });
    const out = await run(
      {
        v: 1,
        mode: "sequential",
        calls: [{ id: "A", tool: "execute", operationId: "issues.get", args: {} }],
        proposals: [
          {
            id: "W1",
            operationId: "issues.create",
            args: { title: { $ref: "A.result.title" }, label: { $ref: "A.result.labels.0" } },
          },
          {
            id: "W2",
            operationId: "issues.createComment",
            args: { issue_number: { $ref: "W1.result.number" }, body: { $ref: "W1.args.title" } },
          },
        ],
      },
      host
    );

    expect(out.ok).toBe(true);
    expect(executed).toEqual(["issues.get"]);
    const [w1, w2] = proposalsOf(out);
    expect(w1).toMatchObject({
      id: "W1",
      status: "ready",
      args: { title: "Flaky test", label: "bug" },
      dependsOn: ["A"],
      policy: "mandate",
    });
    expect(w1!.argsHash).toBe(
      await Effect.runPromise(
        hashPendingArgsEffect({ operationId: "issues.create", args: w1!.args })
      )
    );
    expect(w2).toMatchObject({
      id: "W2",
      status: "deferred",
      args: { issue_number: { $ref: "W1.result.number" }, body: "Flaky test" },
      pendingRefs: [{ at: "/issue_number", ref: "W1.result.number" }],
      dependsOn: ["W1"],
    });
    expect(w2!.argsHash).toBeUndefined();
    expect(out.diagnostics.proposalCount).toBe(2);
    expect(out.diagnostics.nextStep).toContain("submit_program_proposals");
  });

  it("defers args refs that read a still-pending placeholder, resolves the rest", async () => {
    const { host } = proposalHost(OPS);
    const out = await run(
      {
        v: 1,
        proposals: [
          { id: "W1", operationId: "issues.create", args: { title: "t" } },
          {
            id: "W2",
            operationId: "issues.createComment",
            args: { issue: { $ref: "W1.result.number" }, title: { $ref: "W1.args.title" } },
          },
          {
            id: "W3",
            operationId: "issues.createComment",
            args: { a: { $ref: "W2.args.issue" }, b: { $ref: "W2.args.title" } },
          },
        ],
      },
      host
    );
    const [, w2, w3] = proposalsOf(out);
    expect(w2).toMatchObject({ status: "deferred", args: { title: "t" } });
    expect(w3).toMatchObject({
      status: "deferred",
      args: { a: { $ref: "W2.args.issue" }, b: "t" },
      pendingRefs: [{ at: "/a", ref: "W2.args.issue" }],
    });
  });

  it("rejects proposals whose refs cannot resolve, and their dependents (fail closed)", async () => {
    const { host } = proposalHost(OPS, {
      "issues.get": { ok: false, error: "404" },
      "crm.contract.get": { contract: { id: "c1", parties: ["x"] } },
    });
    const out = await run(
      {
        v: 1,
        calls: [
          { id: "A", tool: "execute", operationId: "issues.get" },
          { id: "B", tool: "execute", operationId: "crm.contract.get" },
        ],
        proposals: [
          { id: "W1", operationId: "issues.create", args: { t: { $ref: "A.result.title" } } },
          { id: "W2", operationId: "issues.create", args: { t: { $ref: "B.result.contract" } } },
          { id: "W3", operationId: "issues.create", args: { t: { $ref: "B.result.nope" } } },
          { id: "W4", operationId: "issues.create", args: { t: { $ref: "W1.args.t" } } },
          { id: "W5", operationId: "no.such.op", args: {} },
          { id: "W6", operationId: "issues.create", args: { t: { $ref: "B.result.contract.id" } } },
        ],
      },
      host
    );
    const byId = Object.fromEntries(proposalsOf(out).map((p) => [p.id, p]));
    expect(byId.W1).toMatchObject({ status: "rejected", code: "ref_unresolved" });
    expect(byId.W1!.error).toContain("read call A failed");
    expect(byId.W2).toMatchObject({ status: "rejected", code: "ref_unresolved" });
    expect(byId.W2!.error).toContain("not a single JSON value");
    expect(byId.W3).toMatchObject({ status: "rejected", code: "ref_unresolved" });
    expect(byId.W4).toMatchObject({ status: "rejected", code: "dependency_rejected" });
    expect(byId.W5).toMatchObject({ status: "rejected", code: "unknown_operation" });
    expect(byId.W6).toMatchObject({ status: "ready", args: { t: "c1" } });
    expect(out.ok).toBe(false);
    expect(out.diagnostics.error).toBe("one or more program calls failed");
  });

  it("reports rejected proposals when every read succeeded", async () => {
    const { host } = proposalHost(OPS);
    const out = await run({ v: 1, proposals: [{ id: "W1", operationId: "no.such.op" }] }, host);
    expect(out.ok).toBe(false);
    expect(out.diagnostics.error).toBe("one or more proposals were rejected");
  });

  it("caps proposals per program", async () => {
    const { host } = proposalHost(OPS);
    const proposals = Array.from({ length: 3 }, (_, i) => ({
      id: `W${i}`,
      operationId: "issues.create",
    }));
    const out = await run({ v: 1, proposals }, host, { CLAWQL_PROGRAM_MAX_PROPOSALS: "2" });
    expect(out.ok).toBe(false);
    expect(out.diagnostics.error).toContain("max proposals (3 > 2)");
  });

  it("keeps an empty plan an error", async () => {
    const { host } = proposalHost(OPS);
    const out = await run({ v: 1, calls: [], proposals: [] }, host);
    expect(out.ok).toBe(false);
    expect(out.diagnostics.error).toBe("plan.calls is empty");
  });

  it("stores the resolved set for submit under the caller's session key", async () => {
    const { host } = proposalHost(OPS);
    const record = await Effect.runPromise(
      Effect.gen(function* () {
        const out = yield* runProgramEffect(
          {
            source: JSON.stringify({
              v: 1,
              proposals: [{ id: "W1", operationId: "issues.create", args: { title: "t" } }],
            }),
            sessionId: "sess-1",
          },
          host,
          {}
        );
        const store = yield* currentProgramProposalStoreEffect;
        return {
          mine: yield* store.get("sess-1", out.programId),
          other: yield* store.get("sess-2", out.programId),
          out,
        };
      }).pipe(Effect.provide(makeProgramProposalStoreLayer()))
    );
    expect(record.mine?.proposals).toEqual(proposalsOf(record.out));
    expect(record.mine?.leaves).toEqual({});
    expect(record.other).toBeUndefined();
  });
});

describe("execute_program — session IFC on proposals (ADR 0015 § Program memory)", () => {
  const IFC_ON = { CLAWQL_ENABLE_SESSION_IFC: "1", CLAWQL_SESSION_ID: "ifc-test" };
  const laundering = {
    v: 1,
    calls: [{ id: "C", tool: "execute", operationId: "crm.contract.get" }],
    proposals: [
      { id: "W1", operationId: "slack.post", args: { text: { $ref: "C.result.summary" } } },
      { id: "W2", operationId: "issues.create", args: {} },
    ],
  };

  it("blocks a proposal whose destination may not receive what the program read", async () => {
    const { host } = proposalHost(OPS, { "crm.contract.get": { summary: "secret terms" } });
    const out = await run(laundering, host, IFC_ON);
    const [w1, w2] = proposalsOf(out);
    expect(w1).toMatchObject({ status: "rejected", code: "ifc_blocked" });
    expect(w1!.ifc).toMatchObject({
      programLabels: ["source:crm"],
      destLabels: ["source:slack"],
      sessionKey: "ifc-test",
    });
    expect(w2).toMatchObject({ status: "rejected", code: "ifc_blocked" });
    expect(out.ok).toBe(false);
  });

  it("allows same-source destinations and configured flows", async () => {
    const { host } = proposalHost(OPS, { "crm.contract.get": { summary: "s" } });
    const sameSource = await run(
      { ...laundering, proposals: [{ id: "W1", operationId: "slack.post" }] },
      proposalHost({ ...OPS, "slack.post": { policy: "mandate", specLabel: "crm" } }).host,
      IFC_ON
    );
    expect(proposalsOf(sameSource)[0]).toMatchObject({ status: "ready" });

    const configured = await run(laundering, host, {
      ...IFC_ON,
      CLAWQL_SESSION_IFC_ALLOWED: JSON.stringify({
        allowedSourcesByDest: { "source:slack": ["source:crm"], "source:github": ["*"] },
      }),
    });
    expect(proposalsOf(configured).map((p) => p.status)).toEqual(["ready", "ready"]);
  });

  it("is off unless CLAWQL_ENABLE_SESSION_IFC=1", async () => {
    const { host } = proposalHost(OPS, { "crm.contract.get": { summary: "s" } });
    const out = await run(laundering, host, {});
    expect(proposalsOf(out).map((p) => p.status)).toEqual(["ready", "ready"]);
  });

  it("checks session labels for proposals-only plans", async () => {
    accumulateSessionLabelsSync("ifc-test", ["source:hr"]);
    const { host } = proposalHost(OPS);
    const out = await run(
      { v: 1, proposals: [{ id: "W1", operationId: "slack.post" }] },
      host,
      IFC_ON
    );
    expect(proposalsOf(out)[0]).toMatchObject({ status: "rejected", code: "ifc_blocked" });
    expect(proposalsOf(out)[0]!.ifc?.sessionLabels).toEqual(["source:hr"]);
  });

  it("fails closed when the host gives no operation info for the destination", async () => {
    const { host } = proposalHost(
      { ...OPS, "slack.post": { policy: "mandate", specLabel: "slack", bare: true } },
      { "crm.contract.get": { summary: "s" } }
    );
    const out = await run(
      { ...laundering, proposals: [{ id: "W1", operationId: "slack.post" }] },
      host,
      {
        ...IFC_ON,
        CLAWQL_SESSION_IFC_ALLOWED: JSON.stringify({
          allowedSourcesByDest: { "source:slack": ["*"] },
        }),
      }
    );
    expect(proposalsOf(out)[0]).toMatchObject({ status: "rejected", code: "ifc_blocked" });
    expect(proposalsOf(out)[0]!.ifc).toMatchObject({
      programLabels: ["source:crm"],
      destLabels: [],
    });
  });

  it("labels reads that failed: their responses are in program memory too", async () => {
    const { host } = proposalHost(OPS, { "crm.contract.get": { ok: false, error: "HTTP 500" } });
    const out = await run(
      { ...laundering, proposals: [{ id: "W1", operationId: "slack.post", args: { text: "hi" } }] },
      host,
      IFC_ON
    );
    expect(out.calls[0]).toMatchObject({ ok: false });
    expect(proposalsOf(out)[0]).toMatchObject({ status: "rejected", code: "ifc_blocked" });
    expect(proposalsOf(out)[0]!.ifc?.programLabels).toEqual(["source:crm"]);
  });
});
