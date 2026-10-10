import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXECUTE_RESULT_CHAR_LIMIT,
  EXECUTE_TRUNCATION_MARKER,
  ExecuteResultTruncationLive,
  ExecuteResultTruncationService,
  executeResultCharLimitEffect,
  serializeExecuteResultEffect,
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

  it("fail-closed envelope when over budget", async () => {
    const bulky = { rows: Array.from({ length: 200 }, (_, i) => ({ id: i, pad: "x".repeat(80) })) };
    const limit = 800;
    const text = await Effect.runPromise(serializeExecuteResultEffect(bulky, { limit }));
    const parsed = JSON.parse(text) as {
      truncated: boolean;
      byteCount: number;
      limit: number;
      marker: string;
      preview: string;
    };
    expect(parsed.truncated).toBe(true);
    expect(parsed.limit).toBe(limit);
    expect(parsed.byteCount).toBeGreaterThan(limit);
    expect(parsed.marker).toBe(EXECUTE_TRUNCATION_MARKER);
    expect(parsed.preview).toContain(EXECUTE_TRUNCATION_MARKER);
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
