import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXECUTE_RESULT_CHAR_LIMIT,
  DEFAULT_OBSERVATION_BUDGET_CHARS,
  EXECUTE_TRUNCATION_MARKER,
  ExecuteResultTruncationLive,
  ExecuteResultTruncationService,
  buildObservationPreview,
  executeResultCharLimitEffect,
  observationBudgetCharsEffect,
  serializeExecuteResultEffect,
  serializeExecuteResultWithBudgetsEffect,
} from "./result-truncation.js";

describe("execute result truncation", () => {
  it("returns full JSON under the budget without truncated flag", async () => {
    const text = await Effect.runPromise(
      serializeExecuteResultEffect({ ok: true, items: [1, 2, 3] }, { limit: 10_000 })
    );
    const parsed = JSON.parse(text) as { ok: boolean; truncated?: boolean };
    expect(parsed.ok).toBe(true);
    expect(parsed.truncated).toBeUndefined();
  });

  it("fail-closed envelope when over hard budget", async () => {
    const bulky = { rows: Array.from({ length: 200 }, (_, i) => ({ id: i, pad: "x".repeat(80) })) };
    const limit = 800;
    const text = await Effect.runPromise(serializeExecuteResultEffect(bulky, { limit }));
    const parsed = JSON.parse(text) as {
      truncated: boolean;
      byteCount: number;
      limit: number;
      marker: string;
      preview: string;
      note: string;
    };
    expect(parsed.truncated).toBe(true);
    expect(parsed.limit).toBe(limit);
    expect(parsed.byteCount).toBeGreaterThan(limit);
    expect(parsed.marker).toBe(EXECUTE_TRUNCATION_MARKER);
    expect(parsed.note).toMatch(/truncated/i);
    expect(text.length).toBeLessThanOrEqual(limit);
  });

  it("reads CLAWQL_EXECUTE_RESULT_MAX_CHARS via Effect", async () => {
    const env = { CLAWQL_EXECUTE_RESULT_MAX_CHARS: "4096" } as NodeJS.ProcessEnv;
    const limit = await Effect.runPromise(executeResultCharLimitEffect(env));
    expect(limit).toBe(4096);
    const fallback = await Effect.runPromise(executeResultCharLimitEffect({} as NodeJS.ProcessEnv));
    expect(fallback).toBe(DEFAULT_EXECUTE_RESULT_CHAR_LIMIT);
  });

  it("ExecuteResultTruncationService layer serializes with truncate flag", async () => {
    const text = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* ExecuteResultTruncationService;
        return yield* svc.serialize({ blob: "y".repeat(500) }, { limit: 200 });
      }).pipe(Effect.provide(ExecuteResultTruncationLive))
    );
    const parsed = JSON.parse(text) as { truncated: boolean };
    expect(parsed.truncated).toBe(true);
  });
});

describe("observation budget", () => {
  const bigList = {
    success: true,
    result: Array.from({ length: 287 }, (_, i) => ({
      id: `dns${i}`,
      type: i % 2 ? "A" : "CNAME",
      name: `host-${i}.example.com`,
      content: "203.0.113.50",
    })),
  };

  it("defaults observation budget to ~8k chars", async () => {
    const n = await Effect.runPromise(observationBudgetCharsEffect({} as NodeJS.ProcessEnv));
    expect(n).toBe(DEFAULT_OBSERVATION_BUDGET_CHARS);
  });

  it("buildObservationPreview puts totalCount in the note (not just preview length)", () => {
    const built = buildObservationPreview(bigList, 20);
    expect(built.shape).toBe("list");
    expect(built.totalCount).toBe(287);
    expect(built.previewCount).toBe(20);
    expect(built.note).toMatch(/287 records, first 20 shown/);
    expect(built.note).toMatch(/totalCount=287/);
    expect(built.note).toMatch(/previewCount=20/);
    expect(built.note).toMatch(/use totalCount/i);
    expect(built.note).toMatch(/truncated/i);
    expect(built.note).toMatch(/full:true/);
    const preview = built.preview as { result: unknown[]; result_info: { truncated: boolean } };
    expect(preview.result).toHaveLength(20);
    expect(preview.result_info.truncated).toBe(true);
  });

  it("truncates large non-list objects by size (no fake row count)", () => {
    const bulky = { id: "z1", blob: "x".repeat(12_000), nested: { a: 1 } };
    const built = buildObservationPreview(bulky, 20, { budgetChars: 8000 });
    expect(built.shape).toBe("object");
    expect(built.totalCount).toBeUndefined();
    expect(built.note).toMatch(/Single object truncated by size/);
    expect(built.note).toMatch(/no row count/i);
    expect(built.note).toMatch(/truncated/i);
  });

  it("applies soft budget when where/fields omitted", async () => {
    const text = await Effect.runPromise(
      serializeExecuteResultWithBudgetsEffect(bigList, {
        observationBudget: 2000,
        hardLimit: 64_000,
      })
    );
    const parsed = JSON.parse(text) as {
      truncated: boolean;
      reason: string;
      note: string;
      totalCount: number;
      previewCount: number;
      shape: string;
      example: string;
    };
    expect(parsed.truncated).toBe(true);
    expect(parsed.reason).toBe("observation_budget");
    expect(parsed.shape).toBe("list");
    expect(parsed.totalCount).toBe(287);
    expect(parsed.previewCount).toBe(20);
    expect(parsed.note).toMatch(/totalCount=287/);
    expect(parsed.note).toMatch(/do not treat the preview as the full answer/i);
    expect(parsed.example).toMatch(/result\[/);
  });

  it("skips soft budget when where is set", async () => {
    const shaped = { aRecordCount: 287 };
    const text = await Effect.runPromise(
      serializeExecuteResultWithBudgetsEffect(shaped, {
        where: "length(result[?type==`A`])",
        observationBudget: 10,
        hardLimit: 64_000,
      })
    );
    const parsed = JSON.parse(text) as { aRecordCount: number; truncated?: boolean };
    expect(parsed.aRecordCount).toBe(287);
    expect(parsed.truncated).toBeUndefined();
  });

  it("skips soft budget when full:true", async () => {
    const text = await Effect.runPromise(
      serializeExecuteResultWithBudgetsEffect(bigList, {
        full: true,
        observationBudget: 2000,
        hardLimit: 2_000_000,
      })
    );
    const parsed = JSON.parse(text) as { result: unknown[]; truncated?: boolean };
    expect(parsed.result).toHaveLength(287);
    expect(parsed.truncated).toBeUndefined();
  });
});
