import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { clearAllSessionLabelsSync } from "../ifc/session-label-store.js";
import { hashPendingArgsEffect } from "../pending/args-hash.js";
import { PendingExecutionService } from "../pending/pending-execution-service.js";
import type {
  PendingExecutionRecord,
  PendingExecutionStatus,
} from "../pending/pending-execution-types.js";
import type { OperationRiskPolicy } from "../risk/operation-risk-types.js";
import {
  currentProgramProposalStoreEffect,
  makeProgramProposalStoreLayer,
} from "./program-proposal-store.js";
import { parseProgramPlanEffect, type ProgramPlan } from "./program-plan.js";
import type { ResolvedProposal } from "./program-proposals.js";
import { runProgramEffect, runProgramPlanEffect, type ProgramHost } from "./program-runner.js";
import {
  parkedMandateStatusEffect,
  ProgramSubmitLive,
  ProgramSubmitService,
  submitProgramProposalsEffect,
  type ProgramSubmitExecuteInput,
  type ProgramSubmitHost,
  type SubmitProgramProposalsInput,
  type SubmitProgramProposalsResult,
} from "./program-submit.js";

type Policy = OperationRiskPolicy;

/**
 * Gateway double: `mandate` operations park (like execute-core), a Review approval
 * flips the parked record to `approved`, and an execute carrying approvedExecutionId
 * consumes it once.
 */
function gateway(
  policies: Record<string, Policy>,
  results: Record<string, unknown | ((args: Record<string, unknown>) => unknown)> = {},
  opts: { readonly delayMs?: number; readonly specLabels?: Record<string, string> } = {}
) {
  const executed: ProgramSubmitExecuteInput[] = [];
  const parked = new Map<
    string,
    { status: PendingExecutionStatus; input: ProgramSubmitExecuteInput; argsHash: string }
  >();
  const resultOf = (input: ProgramSubmitExecuteInput): unknown => {
    const r = results[input.operationId];
    return typeof r === "function" ? r(input.args) : (r ?? { ok: true });
  };
  const text = (body: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(body) }],
  });

  const lookup: ProgramSubmitHost["lookup"] = (operationId) => {
    const policy = policies[operationId];
    if (!policy) return Effect.succeed({ found: false });
    return Effect.succeed({
      found: true,
      policy,
      operation: {
        id: operationId,
        method: operationId.endsWith(".get") ? "GET" : "POST",
        specLabel: opts.specLabels?.[operationId] ?? "github",
      },
    });
  };

  const submitHost: ProgramSubmitHost = {
    execute: (input) =>
      Effect.gen(function* () {
        if (opts.delayMs) yield* Effect.sleep(opts.delayMs);
        executed.push(input);
        if (input.approvedExecutionId) {
          const rec = parked.get(input.approvedExecutionId);
          if (!rec || rec.status !== "approved") {
            return text({
              ok: false,
              status: "mandate_required",
              reason: "No consumable approved mandate",
            });
          }
          rec.status = "completed";
          return text(resultOf(input));
        }
        const policy = policies[input.operationId];
        if (policy === "block") return text({ ok: false, status: "blocked", reason: "blocked" });
        if (policy === "mandate") {
          const executionId = `pex_${parked.size + 1}`;
          const argsHash = yield* hashPendingArgsEffect({
            operationId: input.operationId,
            args: input.args,
            fields: input.fields,
            where: input.where,
          });
          parked.set(executionId, { status: "pending", input, argsHash });
          return text({
            ok: false,
            status: "mandate_required",
            operationId: input.operationId,
            executionId,
            argsHash,
            approval: { tool: "resume", cli: `clawql resume ${executionId}` },
          });
        }
        return text(resultOf(input));
      }),
    lookup,
    pendingStatus: (executionId) => Effect.succeed(parked.get(executionId)?.status ?? null),
  };

  const programHost: ProgramHost = {
    execute: (input) =>
      Effect.sync(() => text(resultOf({ operationId: input.operationId, args: input.args }))),
    search: () => Effect.succeed({ formattedText: "{}" }),
    resolveRisk: lookup,
  };

  const approveInReview = (executionId: string) => {
    parked.get(executionId)!.status = "approved";
  };
  const setStatus = (executionId: string, status: PendingExecutionStatus) => {
    parked.get(executionId)!.status = status;
  };
  return { submitHost, programHost, executed, parked, approveInReview, setStatus };
}

const CREATE_THEN_COMMENT = {
  v: 1,
  mode: "sequential",
  calls: [{ id: "A", tool: "execute", operationId: "issues.get", args: { n: 1 } }],
  proposals: [
    { id: "W1", operationId: "issues.create", args: { title: { $ref: "A.result.title" } } },
    {
      id: "W2",
      operationId: "issues.createComment",
      args: { issue_number: { $ref: "W1.result.number" }, body: "triaged" },
    },
  ],
};

const RESULTS = {
  "issues.get": { title: "Flaky test" },
  "issues.create": (args: Record<string, unknown>) => ({ number: 42, title: args.title }),
  "issues.createComment": (args: Record<string, unknown>) => ({ id: 9, issue: args.issue_number }),
};

/** One store per test; execute_program and every submit share it. */
function harness(policies: Record<string, Policy>, opts: Parameters<typeof gateway>[2] = {}) {
  const gw = gateway(policies, RESULTS, opts);
  const layer = makeProgramProposalStoreLayer();
  const program = async (plan: unknown = CREATE_THEN_COMMENT, env: NodeJS.ProcessEnv = {}) =>
    Effect.runPromise(
      runProgramEffect({ source: JSON.stringify(plan) }, gw.programHost, env).pipe(
        Effect.provide(layer)
      )
    );
  const submit = async (
    input: SubmitProgramProposalsInput,
    env: NodeJS.ProcessEnv = {}
  ): Promise<SubmitProgramProposalsResult> =>
    Effect.runPromise(
      submitProgramProposalsEffect(input, gw.submitHost, env).pipe(Effect.provide(layer))
    );
  return { gw, layer, program, submit };
}

const leaf = (out: SubmitProgramProposalsResult, id: string) =>
  out.leaves.find((l) => l.id === id)!;

const ALL_ALLOW = {
  "issues.get": "allow",
  "issues.create": "allow",
  "issues.createComment": "allow",
} as const;
const MANDATE = {
  "issues.get": "allow",
  "issues.create": "mandate",
  "issues.createComment": "mandate",
} as const;

afterEach(() => {
  clearAllSessionLabelsSync();
});

describe("submit_program_proposals", () => {
  it("runs proposals in order and fills <proposal>.result refs from actual results", async () => {
    const { gw, program, submit } = harness(ALL_ALLOW);
    const ran = await program();
    expect(gw.executed).toEqual([]);

    const out = await submit({ programId: ran.programId });
    expect(out).toMatchObject({
      ok: true,
      complete: true,
      summary: { ran: 2, failed: 0, dropped: 0, pending: 0 },
    });
    expect(gw.executed.map((e) => [e.operationId, e.args])).toEqual([
      ["issues.create", { title: "Flaky test" }],
      ["issues.createComment", { issue_number: 42, body: "triaged" }],
    ]);
    expect(leaf(out, "W2")).toMatchObject({
      state: "ran",
      args: { issue_number: 42, body: "triaged" },
      result: { id: 9, issue: 42 },
      argsHash: await Effect.runPromise(
        hashPendingArgsEffect({
          operationId: "issues.createComment",
          args: { issue_number: 42, body: "triaged" },
        })
      ),
    });
  });

  it("never runs a settled leaf twice", async () => {
    const { gw, program, submit } = harness(ALL_ALLOW);
    const { programId } = await program();
    const first = await submit({ programId });
    const second = await submit({ programId });
    expect(gw.executed).toHaveLength(2);
    expect(second.leaves).toEqual(first.leaves);
  });

  it("parks mandate leaves with the digest execute_program bound, then consumes a Review approval once", async () => {
    const { gw, program, submit } = harness(MANDATE);
    const ran = await program();
    const w1Proposal = (ran.result as { proposals: ResolvedProposal[] }).proposals[0]!;

    const first = await submit({ programId: ran.programId });
    expect(first).toMatchObject({ ok: true, complete: false, summary: { pending: 2 } });
    expect(leaf(first, "W1")).toMatchObject({
      state: "pending",
      status: "mandate_required",
      executionId: "pex_1",
      argsHash: w1Proposal.argsHash,
    });
    expect(gw.parked.get("pex_1")!.argsHash).toBe(w1Proposal.argsHash);
    expect(leaf(first, "W2")).toMatchObject({
      state: "pending",
      status: "waiting",
      waitingOn: ["W1"],
    });

    const stillPending = await submit({ programId: ran.programId });
    expect(gw.executed).toHaveLength(1);
    expect(stillPending.summary.pending).toBe(2);

    gw.approveInReview("pex_1");
    const second = await submit({ programId: ran.programId });
    expect(gw.executed[1]).toMatchObject({
      operationId: "issues.create",
      approvedExecutionId: "pex_1",
    });
    expect(leaf(second, "W1")).toMatchObject({
      state: "ran",
      executionId: "pex_1",
      result: { number: 42 },
    });
    expect(leaf(second, "W1").status).toBeUndefined();
    expect(leaf(second, "W2")).toMatchObject({
      state: "pending",
      status: "mandate_required",
      executionId: "pex_2",
      args: { issue_number: 42, body: "triaged" },
    });

    gw.approveInReview("pex_2");
    const third = await submit({ programId: ran.programId });
    expect(third).toMatchObject({ ok: true, complete: true, summary: { ran: 2 } });
    expect(gw.executed.filter((e) => e.approvedExecutionId)).toHaveLength(2);
  });

  it("adopts mandates settled outside the batch", async () => {
    const { gw, program, submit } = harness(MANDATE);
    const { programId } = await program();
    await submit({ programId });
    gw.setStatus("pex_1", "completed");
    const out = await submit({ programId });
    expect(leaf(out, "W1")).toMatchObject({
      state: "ran",
      status: "completed",
      resultCaptured: false,
    });
    expect(leaf(out, "W2")).toMatchObject({ state: "dropped", code: "result_unavailable" });

    for (const [status, state, dependent] of [
      ["declined", "dropped", "dependency_dropped"],
      ["expired", "dropped", "dependency_dropped"],
      ["failed", "failed", "dependency_failed"],
      ["outcome_unknown", "failed", "dependency_failed"],
    ] as const) {
      const h = harness(MANDATE);
      const p = await h.program();
      await h.submit({ programId: p.programId });
      h.gw.setStatus("pex_1", status);
      const settled = await h.submit({ programId: p.programId });
      expect(leaf(settled, "W1")).toMatchObject({ state, status });
      expect(leaf(settled, "W2")).toMatchObject({ state: "dropped", code: dependent });
      expect(settled).toMatchObject({ ok: false, complete: true });
      expect(h.gw.executed).toHaveLength(1);
    }
  });

  it("keeps a parked leaf pending while the mandate store cannot be read", async () => {
    const { gw, program, layer } = harness(MANDATE);
    const { programId } = await program();
    const unreadable: ProgramSubmitHost = {
      ...gw.submitHost,
      pendingStatus: () => Effect.fail(new Error("disk hiccup")),
    };
    const submitWith = (host: ProgramSubmitHost) =>
      Effect.runPromise(
        submitProgramProposalsEffect({ programId }, host, {}).pipe(Effect.provide(layer))
      );
    const first = await submitWith(gw.submitHost);
    gw.approveInReview("pex_1");
    const out = await submitWith(unreadable);
    expect(leaf(out, "W1")).toEqual(leaf(first, "W1"));
    expect(gw.executed).toHaveLength(1);
    const later = await submitWith(gw.submitHost);
    expect(leaf(later, "W1")).toMatchObject({ state: "ran", executionId: "pex_1" });
  });

  it("drops rejected and blocked proposals and the leaves that depend on them", async () => {
    const { gw, program, submit } = harness({ ...ALL_ALLOW, "issues.create": "block" });
    const ran = await program({
      v: 1,
      proposals: [
        { id: "W0", operationId: "no.such.op" },
        { id: "W1", operationId: "issues.create", args: { title: "t" } },
        {
          id: "W2",
          operationId: "issues.createComment",
          args: { n: { $ref: "W1.result.number" } },
        },
      ],
    });
    const out = await submit({ programId: ran.programId });
    expect(leaf(out, "W0")).toMatchObject({ state: "dropped", code: "unknown_operation" });
    expect(leaf(out, "W1")).toMatchObject({ state: "dropped", code: "blocked", status: "blocked" });
    expect(leaf(out, "W2")).toMatchObject({ state: "dropped", code: "dependency_dropped" });
    expect(gw.executed.map((e) => e.operationId)).toEqual(["issues.create"]);
  });

  it("marks failed executes and drops their dependents", async () => {
    const h = harness(ALL_ALLOW);
    const gw = gateway(ALL_ALLOW, {
      ...RESULTS,
      "issues.create": { ok: false, error: "HTTP 422" },
    });
    const ran = await h.program();
    const out = await Effect.runPromise(
      submitProgramProposalsEffect({ programId: ran.programId }, gw.submitHost, {}).pipe(
        Effect.provide(h.layer)
      )
    );
    expect(leaf(out, "W1")).toMatchObject({ state: "failed", error: "HTTP 422" });
    expect(leaf(out, "W2")).toMatchObject({ state: "dropped", code: "dependency_failed" });
  });

  it("accepts echoed proposals only when they match the stored record", async () => {
    const { program, submit } = harness(ALL_ALLOW);
    const ran = await program();
    const echoed = (ran.result as { proposals: ResolvedProposal[] }).proposals;
    const tampered = echoed.map((p, i) => (i === 0 ? { ...p, args: { title: "other" } } : p));

    expect(await submit({ programId: ran.programId, proposals: tampered })).toMatchObject({
      ok: false,
      code: "proposals_mismatch",
    });
    expect(await submit({ programId: ran.programId, proposals: echoed })).toMatchObject({
      ok: true,
      complete: true,
    });
  });

  it("runs echoed proposals when this process has no record (other replica)", async () => {
    const first = harness(ALL_ALLOW);
    const ran = await first.program();
    const echoed = (ran.result as { proposals: ResolvedProposal[] }).proposals;

    const elsewhere = harness(ALL_ALLOW);
    expect(await elsewhere.submit({ programId: ran.programId })).toMatchObject({
      ok: false,
      code: "program_not_found",
    });
    const out = await elsewhere.submit({ programId: ran.programId, proposals: echoed });
    expect(out).toMatchObject({ ok: true, complete: true });
    expect(leaf(out, "W2").args).toEqual({ issue_number: 42, body: "triaged" });
    const again = await elsewhere.submit({ programId: ran.programId });
    expect(again.leaves).toEqual(out.leaves);
    expect(elsewhere.gw.executed).toHaveLength(2);
  });

  it("keeps echoed rejections rejected on a replica without the record", async () => {
    const first = harness(ALL_ALLOW);
    const ran = await first.program({
      v: 1,
      calls: [{ id: "A", tool: "execute", operationId: "issues.get", args: { n: 1 } }],
      proposals: [
        { id: "W1", operationId: "issues.create", args: { title: { $ref: "A.result.missing" } } },
        { id: "W2", operationId: "issues.createComment", args: { n: { $ref: "W1.args.title" } } },
        { id: "W3", operationId: "issues.create", args: { title: { $ref: "A.result.title" } } },
      ],
    });
    const echoed = (ran.result as { proposals: ResolvedProposal[] }).proposals;
    expect(echoed.map((p) => [p.id, p.status, p.code])).toEqual([
      ["W1", "rejected", "ref_unresolved"],
      ["W2", "rejected", "dependency_rejected"],
      ["W3", "ready", undefined],
    ]);

    const elsewhere = harness(ALL_ALLOW);
    const out = await elsewhere.submit({ programId: ran.programId, proposals: echoed });
    expect(out.leaves.map((l) => [l.id, l.state, l.code])).toEqual([
      ["W1", "dropped", "ref_unresolved"],
      ["W2", "dropped", "dependency_rejected"],
      ["W3", "ran", undefined],
    ]);
    expect(elsewhere.gw.executed.map((e) => e.args)).toEqual([{ title: "Flaky test" }]);
    const again = await elsewhere.submit({ programId: ran.programId, proposals: echoed });
    expect(again.leaves).toEqual(out.leaves);
  });

  it("refuses bad input", async () => {
    const { program, submit } = harness(ALL_ALLOW);
    expect(await submit({ programId: "nope" })).toMatchObject({ code: "invalid_program_id" });
    const ran = await program();
    expect(await submit({ programId: ran.programId, sessionId: "someone-else" })).toMatchObject({
      code: "program_not_found",
    });

    const other = harness(ALL_ALLOW);
    expect(
      await other.submit({
        programId: ran.programId,
        proposals: [{ id: "W1", operationId: "x", args: { a: { $ref: "A.result.id" } } }],
      })
    ).toMatchObject({ code: "invalid_proposals" });
    expect(
      await other.submit(
        { programId: ran.programId, proposals: [{ operationId: "a" }, { operationId: "b" }] },
        { CLAWQL_PROGRAM_MAX_PROPOSALS: "1" }
      )
    ).toMatchObject({ code: "too_many_proposals" });
  });

  it("checks session IFC with the program's labels before executing", async () => {
    const { gw, layer, submit } = harness(ALL_ALLOW, { specLabels: { "issues.create": "slack" } });
    const programId = "prog_0123456789abcdef01234567";
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* currentProgramProposalStoreEffect;
        yield* store.put({
          programId,
          owner: "ifc-sess",
          createdAtMs: Date.now(),
          expiresAtMs: Date.now() + 60_000,
          programLabels: ["source:crm"],
          proposals: [
            {
              id: "W1",
              index: 0,
              operationId: "issues.create",
              status: "ready",
              args: { title: "contract terms" },
              dependsOn: [],
            },
          ],
          leaves: {},
        });
      }).pipe(Effect.provide(layer))
    );
    const env = { CLAWQL_ENABLE_SESSION_IFC: "1", CLAWQL_SESSION_ID: "ifc-sess" };
    const out = await submit({ programId }, env);
    expect(leaf(out, "W1")).toMatchObject({
      state: "dropped",
      code: "ifc_blocked",
      status: "blocked",
    });
    expect(gw.executed).toEqual([]);
  });

  it("serializes concurrent submits of one program", async () => {
    const { gw, program, layer } = harness(ALL_ALLOW, { delayMs: 20 });
    const { programId } = await program();
    const once = submitProgramProposalsEffect({ programId }, gw.submitHost, {});
    const [a, b] = await Effect.runPromise(
      Effect.all([once, once], { concurrency: "unbounded" }).pipe(Effect.provide(layer))
    );
    expect(gw.executed).toHaveLength(2);
    expect(a.leaves).toEqual(b.leaves);
  });

  it("serializes concurrent echoed submits before any record exists", async () => {
    const first = harness(ALL_ALLOW);
    const ran = await first.program();
    const echoed = (ran.result as { proposals: ResolvedProposal[] }).proposals;
    const elsewhere = harness(ALL_ALLOW, { delayMs: 20 });
    const once = submitProgramProposalsEffect(
      { programId: ran.programId, proposals: echoed },
      elsewhere.gw.submitHost,
      {}
    );
    const [a, b] = await Effect.runPromise(
      Effect.all([once, once], { concurrency: "unbounded" }).pipe(Effect.provide(elsewhere.layer))
    );
    expect(elsewhere.gw.executed).toHaveLength(2);
    expect(a.leaves).toEqual(b.leaves);
  });

  it("keeps the first proposals and their leaves when a program runs again under its id", async () => {
    const { gw, layer, submit } = harness(ALL_ALLOW);
    const programId = "prog_durable0123456789";
    const runAs = (host: ProgramHost) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const plan = (yield* parseProgramPlanEffect(
            JSON.stringify(CREATE_THEN_COMMENT)
          )) as ProgramPlan;
          return yield* runProgramPlanEffect(
            { programId, plan, timeoutMs: 5_000, maxOutputBytes: 256 * 1024, env: {} },
            host
          );
        }).pipe(Effect.provide(layer))
      );
    await runAs(gw.programHost);
    const first = await submit({ programId });
    expect(first.summary.ran).toBe(2);

    const changedReads: ProgramHost = {
      ...gw.programHost,
      execute: () =>
        Effect.succeed({
          content: [{ type: "text" as const, text: JSON.stringify({ title: "Changed" }) }],
        }),
    };
    const again = await runAs(changedReads);
    expect((again.result as { proposals: ResolvedProposal[] }).proposals[0]!.args).toEqual({
      title: "Flaky test",
    });
    const second = await submit({ programId });
    expect(second.leaves).toEqual(first.leaves);
    expect(gw.executed).toHaveLength(2);
  });

  it("is available as an Effect service", async () => {
    const { gw, program, layer } = harness(ALL_ALLOW);
    const { programId } = await program();
    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* ProgramSubmitService;
        return yield* svc.submit({ programId }, gw.submitHost, {});
      }).pipe(Effect.provide(Layer.merge(ProgramSubmitLive, layer)))
    );
    expect(out.summary.ran).toBe(2);
  });
});

describe("parkedMandateStatusEffect", () => {
  const unused = () => Effect.die("unused");
  const storeWith = (
    records: Record<string, Pick<PendingExecutionRecord, "status" | "expiresAt">>
  ) =>
    Layer.succeed(
      PendingExecutionService,
      PendingExecutionService.of({
        load: (id) => Effect.succeed((records[id] as PendingExecutionRecord | undefined) ?? null),
        park: unused,
        decide: unused,
        tryConsume: unused,
        markCompleted: unused,
        resolveOutcomeUnknown: unused,
      })
    );

  it("reads expiry the store has not recorded yet", async () => {
    const now = Date.parse("2026-10-10T00:00:00Z");
    const past = "2026-10-09T00:00:00Z";
    const future = "2026-10-11T00:00:00Z";
    const layer = storeWith({
      live: { status: "pending", expiresAt: future },
      stale: { status: "pending", expiresAt: past },
      staleApproval: { status: "approved", expiresAt: past },
      done: { status: "completed", expiresAt: past },
    });
    const statusOf = (id: string) =>
      Effect.runPromise(parkedMandateStatusEffect(id, now).pipe(Effect.provide(layer)));
    expect(await statusOf("live")).toBe("pending");
    expect(await statusOf("stale")).toBe("expired");
    expect(await statusOf("staleApproval")).toBe("expired");
    expect(await statusOf("done")).toBe("completed");
    expect(await statusOf("missing")).toBeNull();
  });
});
