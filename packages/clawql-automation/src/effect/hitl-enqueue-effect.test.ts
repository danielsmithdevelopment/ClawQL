import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { executeHitlEnqueueLabelStudioEffect } from "./hitl-enqueue-effect.js";

describe("executeHitlEnqueueLabelStudioEffect", () => {
  it("soft-fails when Label Studio is not configured", async () => {
    delete process.env.CLAWQL_LABEL_STUDIO_URL;
    delete process.env.CLAWQL_LABEL_STUDIO_API_TOKEN;
    const result = await Effect.runPromise(
      executeHitlEnqueueLabelStudioEffect({
        project_id: 1,
        tasks: [{ data: { text: "x" } }],
      })
    );
    const body = JSON.parse(result.content[0]!.text) as { error?: string };
    expect(body.error).toMatch(/Label Studio is not configured/i);
  });

  it("soft-fails empty tasks", async () => {
    process.env.CLAWQL_LABEL_STUDIO_URL = "http://ls.test";
    process.env.CLAWQL_LABEL_STUDIO_API_TOKEN = "tok";
    const result = await Effect.runPromise(
      executeHitlEnqueueLabelStudioEffect({
        project_id: 1,
        tasks: [],
      })
    );
    const body = JSON.parse(result.content[0]!.text) as { error?: string };
    expect(body.error).toMatch(/non-empty/i);
    delete process.env.CLAWQL_LABEL_STUDIO_URL;
    delete process.env.CLAWQL_LABEL_STUDIO_API_TOKEN;
  });

  it("soft-fails invalid predictions without throwing", async () => {
    process.env.CLAWQL_LABEL_STUDIO_URL = "http://ls.test";
    process.env.CLAWQL_LABEL_STUDIO_API_TOKEN = "tok";
    const result = await Effect.runPromise(
      executeHitlEnqueueLabelStudioEffect({
        project_id: 1,
        tasks: [{ data: { text: "x" }, predictions: [{ result: "nope" as never }] }],
      })
    );
    const body = JSON.parse(result.content[0]!.text) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/result must be an array/);
    delete process.env.CLAWQL_LABEL_STUDIO_URL;
    delete process.env.CLAWQL_LABEL_STUDIO_API_TOKEN;
  });
});
