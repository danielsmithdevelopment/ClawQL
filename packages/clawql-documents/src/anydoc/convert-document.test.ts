import { describe, expect, it } from "vitest";
import { recommendConvertRoute, runConvertDocumentWithApi } from "./convert-document.js";

describe("recommendConvertRoute", () => {
  it("prefers local_markdown on success", () => {
    expect(recommendConvertRoute({ ok: true, format: "docx" }).route).toBe("local_markdown");
  });

  it("routes scanned PDF failures to Docling", () => {
    expect(
      recommendConvertRoute({
        ok: false,
        error: "Scanned or image-only PDFs (needing OCR) are unsupported",
      }).route
    ).toBe("docling_ocr");
  });

  it("falls back to tika for other errors", () => {
    expect(recommendConvertRoute({ ok: false, error: "corrupt container" }).route).toBe(
      "tika_fallback"
    );
  });
});

describe("runConvertDocumentWithApi", () => {
  it("returns markdown from injected anydoc API", async () => {
    const api = {
      toMarkdown: async () => "# from path",
      toMarkdownBytes: async () => "# Hello\n\nWorld",
      formatFromBytes: () => "docx",
      formatFromPath: () => "docx",
      formatFromExtension: () => "docx",
    };
    const result = await runConvertDocumentWithApi(
      { base64: Buffer.from("fake").toString("base64") },
      api
    );
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("anydoc");
    expect(result.format).toBe("docx");
    expect(result.markdown).toContain("Hello");
    expect(result.route).toBe("local_markdown");
  });

  it("maps conversion errors to route recommendations", async () => {
    const api = {
      toMarkdown: async () => "",
      toMarkdownBytes: async () => {
        throw new Error("image-only PDF needing OCR");
      },
      formatFromBytes: () => "pdf",
      formatFromPath: () => "pdf",
      formatFromExtension: () => "pdf",
    };
    const result = await runConvertDocumentWithApi(
      { base64: Buffer.from("%PDF").toString("base64") },
      api
    );
    expect(result.ok).toBe(false);
    expect(result.route).toBe("docling_ocr");
  });
});
