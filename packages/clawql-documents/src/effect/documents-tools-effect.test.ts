import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { documentsServicesLiveLayer } from "./documents-effect-runtime.js";
import {
  executeClassifyDocumentEffect,
  executeExtractDocumentEffect,
} from "./documents-tools-effect.js";

describe("documents-tools-effect re-exports", () => {
  it("classify façade uses Effect.gen staging", async () => {
    delete process.env.CLASSIFIER_BASE_URL;
    const result = await Effect.runPromise(
      executeClassifyDocumentEffect({ text: "Form W-2 wage statement" }).pipe(
        Effect.provide(documentsServicesLiveLayer())
      )
    );
    expect(result.ok).toBe(true);
    expect(result.label).toBe("w2");
  });

  it("extract façade uses Effect.gen staging", async () => {
    delete process.env.LANGEXTRACT_BASE_URL;
    const text = "Form W-2\nBox 1 Wages: 85000.00\nEmployee:\n  Name: JANE Q PUBLIC\n";
    const result = await Effect.runPromise(
      executeExtractDocumentEffect({ text, schema_preset: "w2" }).pipe(
        Effect.provide(documentsServicesLiveLayer())
      )
    );
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("heuristic-local");
  });
});
