import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { programsEnabled, ProgramModeLive, ProgramModeService } from "./program-mode.js";
import { parseProgramPlanEffect } from "./program-plan.js";
import {
  ProgramRunnerLive,
  ProgramRunnerService,
  runProgramEffect,
  type ProgramHost,
} from "./program-runner.js";

function mockHost(options?: {
  readonly executePolicy?: "allow" | "mandate" | "block";
  readonly found?: boolean;
}): {
  readonly host: ProgramHost;
  readonly executeCalls: Array<{ operationId: string; programId: string }>;
  readonly searchCalls: Array<{ query: string; programId: string }>;
} {
  const executeCalls: Array<{ operationId: string; programId: string }> = [];
  const searchCalls: Array<{ query: string; programId: string }> = [];
  const policy = options?.executePolicy ?? "allow";
  const found = options?.found ?? true;
  const host: ProgramHost = {
    execute: (input, ctx) =>
      Effect.sync(() => {
        executeCalls.push({ operationId: input.operationId, programId: ctx.programId });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, operationId: input.operationId, args: input.args }),
            },
          ],
        };
      }),
    search: (input, ctx) =>
      Effect.sync(() => {
        searchCalls.push({ query: input.query, programId: ctx.programId });
        return {
          formattedText: JSON.stringify({
            ok: true,
            query: input.query,
            results: [{ id: "op.list", kind: "operation" }],
          }),
        };
      }),
    resolveRisk: (_operationId) =>
      Effect.succeed(
        found
          ? {
              found: true as const,
              policy,
              risk: {
                policy,
                level: policy === "allow" ? ("LOW" as const) : policy === "block" ? ("HIGH" as const) : ("MEDIUM" as const),
                source: "spec-default" as const,
                reason: `mock ${policy}`,
              },
            }
          : { found: false as const }
      ),
  };
  return { host, executeCalls, searchCalls };
}

describe("programsEnabled", () => {
  it("defaults off", () => {
    expect(programsEnabled({})).toBe(false);
  });

  it("enables with CLAWQL_ENABLE_PROGRAMS=1", () => {
    expect(programsEnabled({ CLAWQL_ENABLE_PROGRAMS: "1" })).toBe(true);
    expect(programsEnabled({ CLAWQL_ENABLE_PROGRAMS: "true" })).toBe(true);
  });

  it("ProgramModeService Layer agrees", async () => {
    const via = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* ProgramModeService;
        return yield* svc.enabled({ CLAWQL_ENABLE_PROGRAMS: "1" });
      }).pipe(Effect.provide(ProgramModeLive))
    );
    expect(via).toBe(true);
  });
});

describe("parseProgramPlanEffect", () => {
  it("parses parallel plan object", async () => {
    const plan = await Effect.runPromise(
      parseProgramPlanEffect(
        JSON.stringify({
          v: 1,
          mode: "parallel",
          calls: [
            { tool: "execute", operationId: "a.list", args: {} },
            { tool: "search", query: "list issues" },
          ],
        })
      )
    );
    expect("ok" in plan && plan.ok === false).toBe(false);
    if ("ok" in plan && plan.ok === false) throw new Error("unexpected");
    expect(plan.mode).toBe("parallel");
    expect(plan.calls).toHaveLength(2);
    expect(plan.kind).toBe("plan");
  });

  it("rejects free-form JS with honesty fix hint", async () => {
    const err = await Effect.runPromise(
      parseProgramPlanEffect("await execute({ operationId: 'x', args: {} })")
    );
    expect(err).toMatchObject({ ok: false });
    if (!("ok" in err) || err.ok !== false) throw new Error("expected parse error");
    expect(err.fixHint).toMatch(/OpenCode vendor is next/i);
  });
});

describe("runProgramEffect", () => {
  it("fans out parallel read executes and records programId on each call", async () => {
    const { host, executeCalls } = mockHost();
    const source = JSON.stringify({
      v: 1,
      mode: "parallel",
      calls: [
        { tool: "execute", operationId: "repo.list", args: { org: "a" }, id: "a" },
        { tool: "execute", operationId: "repo.list", args: { org: "b" }, id: "b" },
      ],
    });
    const out = await Effect.runPromise(runProgramEffect({ source }, host, {}));
    expect(out.ok).toBe(true);
    expect(out.programId).toMatch(/^prog_/);
    expect(out.calls).toHaveLength(2);
    expect(out.calls.every((c) => c.ok && c.programId === out.programId)).toBe(true);
    expect(executeCalls).toHaveLength(2);
    expect(executeCalls.every((c) => c.programId === out.programId)).toBe(true);
    expect(out.diagnostics.interpreter).toBe("plan-runner-v0");
    expect(out.diagnostics.honesty).toMatch(/OpenCode vendor is next/);
  });

  it("rejects write/mandate operations before host execute", async () => {
    const { host, executeCalls } = mockHost({ executePolicy: "mandate" });
    const source = JSON.stringify({
      v: 1,
      mode: "sequential",
      calls: [{ tool: "execute", operationId: "issues.create", args: { title: "x" } }],
    });
    const out = await Effect.runPromise(runProgramEffect({ source }, host, {}));
    expect(out.ok).toBe(false);
    expect(executeCalls).toHaveLength(0);
    expect(out.calls[0]?.status).toBe("program_write_rejected");
    expect(JSON.stringify(out.result)).toMatch(/proposed writes|plain execute/i);
  });

  it("rejects block-policy operations", async () => {
    const { host, executeCalls } = mockHost({ executePolicy: "block" });
    const source = JSON.stringify({
      calls: [{ tool: "execute", operationId: "repos.delete", args: {} }],
    });
    const out = await Effect.runPromise(runProgramEffect({ source }, host, {}));
    expect(out.ok).toBe(false);
    expect(executeCalls).toHaveLength(0);
    expect(out.calls[0]?.status).toBe("program_write_rejected");
  });

  it("allows search alongside execute", async () => {
    const { host, searchCalls, executeCalls } = mockHost();
    const source = JSON.stringify({
      mode: "sequential",
      calls: [
        { tool: "search", query: "list PRs" },
        { tool: "execute", operationId: "pulls.list", args: {} },
      ],
    });
    const out = await Effect.runPromise(runProgramEffect({ source }, host, {}));
    expect(out.ok).toBe(true);
    expect(searchCalls).toHaveLength(1);
    expect(executeCalls).toHaveLength(1);
  });

  it("enforces max tool calls cap", async () => {
    const { host, executeCalls } = mockHost();
    const calls = Array.from({ length: 3 }, (_, i) => ({
      tool: "execute" as const,
      operationId: `op.${i}`,
      args: {},
    }));
    const out = await Effect.runPromise(
      runProgramEffect(
        { source: JSON.stringify({ calls }) },
        host,
        { CLAWQL_PROGRAM_MAX_TOOL_CALLS: "2" }
      )
    );
    expect(out.ok).toBe(false);
    expect(out.diagnostics.error).toMatch(/max tool calls/i);
    expect(executeCalls).toHaveLength(0);
  });

  it("ProgramRunnerService Layer runs the same path", async () => {
    const { host, executeCalls } = mockHost();
    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* ProgramRunnerService;
        return yield* svc.run(
          {
            source: JSON.stringify({
              calls: [{ tool: "execute", operationId: "x.get", args: {} }],
            }),
          },
          host,
          {}
        );
      }).pipe(Effect.provide(ProgramRunnerLive))
    );
    expect(out.ok).toBe(true);
    expect(executeCalls).toHaveLength(1);
  });
});
