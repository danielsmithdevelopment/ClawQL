import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { documentsServicesLiveLayer } from "./documents-effect-runtime.js";
import { executeExtractDocumentEffect } from "./extract-document-effect.js";

describe("executeExtractDocumentEffect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LANGEXTRACT_BASE_URL;
  });

  it("heuristic extract returns grounded wages without sidecar", async () => {
    delete process.env.LANGEXTRACT_BASE_URL;
    const text = "Form W-2\nBox 1 Wages: 85000.00\nEmployee:\n  Name: JANE Q PUBLIC\n";
    const result = await Effect.runPromise(
      executeExtractDocumentEffect({ text, schema_preset: "w2" }).pipe(
        Effect.provide(documentsServicesLiveLayer())
      )
    );
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("heuristic-local");
    expect(result.extractions?.some((e) => e.extraction_class === "wages")).toBe(true);
  });

  it("remote path posts then parses sidecar JSON", async () => {
    process.env.LANGEXTRACT_BASE_URL = "http://langextract.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            backend: "ollama",
            model_id: "mistral",
            extractions: [
              {
                extraction_class: "wages",
                extraction_text: "85000.00",
                attributes: {},
                char_interval: { start: 0, end: 8 },
              },
            ],
          }),
      }))
    );

    const result = await Effect.runPromise(
      executeExtractDocumentEffect({
        text: "Box 1 85000.00",
        schema_preset: "w2",
      }).pipe(Effect.provide(documentsServicesLiveLayer()))
    );

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("langextract-sidecar");
    expect(result.model_id).toBe("mistral");
    expect(result.extractions?.[0]?.extraction_class).toBe("wages");
    expect(fetch).toHaveBeenCalledWith(
      "http://langextract.test/extract",
      expect.objectContaining({ method: "POST" })
    );
  });
});
