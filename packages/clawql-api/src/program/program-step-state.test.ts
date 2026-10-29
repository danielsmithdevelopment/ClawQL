import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ProgramCallRecord } from "./program-runner.js";
import {
  compareProgramStepStateEffect,
  ProgramStepStateLive,
  ProgramStepStateService,
  projectProgramStepStateEffect,
} from "./program-step-state.js";

function call(
  partial: Partial<ProgramCallRecord> & Pick<ProgramCallRecord, "index" | "tool" | "ok">
): ProgramCallRecord {
  return {
    programId: "prog_test",
    ...partial,
  };
}

describe("program step state (claim-path §1 state preserved)", () => {
  it("projects away programId and replayed so baseline and resume compare", async () => {
    const baseline = [
      call({
        index: 0,
        tool: "execute",
        operationId: "pets.get",
        ok: true,
        resultPreview: '{"ok":true}',
      }),
    ];
    const resumed = [
      call({
        index: 0,
        tool: "execute",
        operationId: "pets.get",
        ok: true,
        resultPreview: '{"ok":true}',
        replayed: true,
        programId: "other",
      }),
    ];
    const projected = await Effect.runPromise(projectProgramStepStateEffect(resumed));
    expect(projected).toEqual([
      {
        index: 0,
        tool: "execute",
        operationId: "pets.get",
        ok: true,
        resultPreview: '{"ok":true}',
      },
    ]);
    const cmp = await Effect.runPromise(
      compareProgramStepStateEffect({
        baselineCalls: baseline,
        observedCalls: resumed,
        baselineResult: { done: true },
        observedResult: { done: true },
      })
    );
    expect(cmp.preserved).toBe(true);
    expect(cmp.stepsMatch).toBe(true);
    expect(cmp.resultMatch).toBe(true);
    expect(cmp.mismatchIndexes).toEqual([]);
  });

  it("reports mismatch indexes when a step outcome diverges", async () => {
    const baseline = [
      call({ index: 0, tool: "execute", operationId: "a", ok: true, resultPreview: "1" }),
      call({ index: 1, tool: "execute", operationId: "b", ok: true, resultPreview: "2" }),
    ];
    const observed = [
      call({ index: 0, tool: "execute", operationId: "a", ok: true, resultPreview: "1" }),
      call({ index: 1, tool: "execute", operationId: "b", ok: true, resultPreview: "WRONG" }),
    ];
    const cmp = await Effect.runPromise(
      compareProgramStepStateEffect({
        baselineCalls: baseline,
        observedCalls: observed,
        baselineResult: null,
        observedResult: null,
      })
    );
    expect(cmp.preserved).toBe(false);
    expect(cmp.stepsMatch).toBe(false);
    expect(cmp.mismatchIndexes).toEqual([1]);
  });

  it("fails when program-level results diverge even if steps match", async () => {
    const steps = [
      call({ index: 0, tool: "execute", operationId: "a", ok: true, resultPreview: "1" }),
    ];
    const cmp = await Effect.runPromise(
      compareProgramStepStateEffect({
        baselineCalls: steps,
        observedCalls: steps,
        baselineResult: { v: 1 },
        observedResult: { v: 2 },
      })
    );
    expect(cmp.stepsMatch).toBe(true);
    expect(cmp.resultMatch).toBe(false);
    expect(cmp.preserved).toBe(false);
  });

  it("ProgramStepStateService compare matches the Effect helper", async () => {
    const calls = [call({ index: 0, tool: "search", ok: true, resultPreview: "q", status: "ok" })];
    const viaService = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* ProgramStepStateService;
        return yield* svc.compare({
          baselineCalls: calls,
          observedCalls: calls,
          baselineResult: "same",
          observedResult: "same",
        });
      }).pipe(Effect.provide(ProgramStepStateLive))
    );
    expect(viaService.preserved).toBe(true);
    expect(viaService.meaning).toMatch(/claim-path §1/);
  });
});
