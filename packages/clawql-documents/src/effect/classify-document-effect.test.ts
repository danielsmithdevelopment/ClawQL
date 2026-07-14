import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { documentsServicesLiveLayer } from "./documents-effect-runtime.js";
import { executeClassifyDocumentEffect } from "./classify-document-effect.js";

describe("executeClassifyDocumentEffect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CLASSIFIER_BASE_URL;
  });

  it("heuristic classify returns ok without remote classifier", async () => {
    delete process.env.CLASSIFIER_BASE_URL;
    const result = await Effect.runPromise(
      executeClassifyDocumentEffect({ text: "Form W-2 wage statement" }).pipe(
        Effect.provide(documentsServicesLiveLayer())
      )
    );
    expect(result.ok).toBe(true);
    expect(result.label).toBe("w2");
    expect(result.model_version).toBe("heuristic-local");
  });

  it("remote path posts then parses sidecar JSON", async () => {
    process.env.CLASSIFIER_BASE_URL = "http://classifier.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({
            label: "w2",
            confidence: 0.97,
            model_version: "remote-v1",
            needs_hitl: false,
          }),
      }))
    );

    const result = await Effect.runPromise(
      executeClassifyDocumentEffect({ text: "anything", min_confidence: 0.85 }).pipe(
        Effect.provide(documentsServicesLiveLayer())
      )
    );

    expect(result.ok).toBe(true);
    expect(result.label).toBe("w2");
    expect(result.confidence).toBe(0.97);
    expect(result.model_version).toBe("remote-v1");
    expect(fetch).toHaveBeenCalledWith(
      "http://classifier.test/classify",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("remote HTTP error becomes soft ok=false result", async () => {
    process.env.CLASSIFIER_BASE_URL = "http://classifier.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 503,
        ok: false,
        text: async () => "unavailable",
      }))
    );

    const result = await Effect.runPromise(
      executeClassifyDocumentEffect({ text: "x" }).pipe(
        Effect.provide(documentsServicesLiveLayer())
      )
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/classifier HTTP 503/);
  });
});
