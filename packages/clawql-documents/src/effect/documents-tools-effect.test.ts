import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { documentsServicesLiveLayer } from "./documents-effect-runtime.js";
import { executeClassifyDocumentEffect } from "./documents-tools-effect.js";

describe("executeClassifyDocumentEffect", () => {
  it("heuristic classify returns ok without remote classifier", async () => {
    const result = await Effect.runPromise(
      executeClassifyDocumentEffect({ text: "Form W-2 wage statement" }).pipe(
        Effect.provide(documentsServicesLiveLayer())
      )
    );
    expect(result.ok).toBe(true);
    expect(result.label).toBe("w2");
  });
});
