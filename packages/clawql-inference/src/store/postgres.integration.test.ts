import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PostgresInferenceStore } from "./postgres.js";
import { getInferencePgPool } from "./postgres-pool.js";
import type { InferenceRecord } from "./types.js";

const dbUrl = process.env.CLAWQL_INFERENCE_DATABASE_URL?.trim();

describe.skipIf(!dbUrl)("PostgresInferenceStore integration", () => {
  it("appends and lists inference records", async () => {
    const env = { CLAWQL_INFERENCE_DATABASE_URL: dbUrl! };
    const pool = getInferencePgPool(env);
    if (!pool) throw new Error("expected postgres pool");

    const store = new PostgresInferenceStore(pool, env);
    const record: InferenceRecord = {
      id: randomUUID(),
      correlationId: `corr_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      modelId: "openai/gpt-4o",
      provider: "openai",
      tier: "standard",
      team: "eng",
      messages: [{ role: "user", content: "hi" }],
      response: "hello",
      usage: { inputTokens: 1, outputTokens: 2 },
      latencyMs: 12,
      evaluatorVerdict: "none",
    };

    await store.append(record);
    const listed = await store.list({ modelId: record.modelId, limit: 5 });
    expect(listed.some((r) => r.id === record.id)).toBe(true);

    const traced = await store.getByCorrelationId(record.correlationId!);
    expect(traced).toHaveLength(1);
  });
});
