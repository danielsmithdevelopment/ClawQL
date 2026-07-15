import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  decodeClassifyDocumentInput,
  decodeExtractDocumentInput,
  decodeIngestExternalKnowledgeInput,
  decodeKnowledgeSearchOnyxInput,
  decodeRunIdpPipelineInput,
} from "./documents-input-schema.js";

describe("documents Effect Schema", () => {
  it("decodes ingest documents array", async () => {
    const d = await Effect.runPromise(
      decodeIngestExternalKnowledgeInput({
        dryRun: true,
        documents: [{ path: "Memory/a.md", markdown: "# hi" }],
      })
    );
    expect(d.documents?.[0]?.path).toBe("Memory/a.md");
  });

  it("decodes onyx query", async () => {
    await expect(
      Effect.runPromise(decodeKnowledgeSearchOnyxInput({ query: "payroll" }))
    ).resolves.toMatchObject({ query: "payroll" });
    await expect(
      Effect.runPromise(decodeKnowledgeSearchOnyxInput({ query: "" }))
    ).rejects.toThrow();
  });

  it("decodes idp skip_stages", async () => {
    const d = await Effect.runPromise(
      decodeRunIdpPipelineInput({ dry_run: true, skip_stages: ["paperless", "onyx"] })
    );
    expect(d.skip_stages).toEqual(["paperless", "onyx"]);
  });

  it("decodes classify min_confidence", async () => {
    const d = await Effect.runPromise(
      decodeClassifyDocumentInput({ text: "W-2 wages", min_confidence: 0.9 })
    );
    expect(d.min_confidence).toBe(0.9);
  });

  it("decodes extract nested examples", async () => {
    const d = await Effect.runPromise(
      decodeExtractDocumentInput({
        text: "Hello",
        examples: [
          {
            text: "ex",
            extractions: [{ extraction_class: "a", extraction_text: "b" }],
          },
        ],
      })
    );
    expect(d.examples?.[0]?.extractions[0]?.extraction_class).toBe("a");
  });
});
