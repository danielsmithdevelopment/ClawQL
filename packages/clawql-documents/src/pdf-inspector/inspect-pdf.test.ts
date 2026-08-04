import { describe, expect, it } from "vitest";
import { recommendPdfRoute, runInspectPdfWithApi } from "./inspect-pdf.js";

describe("recommendPdfRoute", () => {
  it("routes TextBased high-confidence to local_markdown", () => {
    const r = recommendPdfRoute({
      pdfType: "TextBased",
      confidence: 0.95,
      pagesNeedingOcr: [],
    });
    expect(r.route).toBe("local_markdown");
  });

  it("routes Scanned to docling_ocr", () => {
    const r = recommendPdfRoute({
      pdfType: "Scanned",
      confidence: 1,
      pagesNeedingOcr: [1, 2],
    });
    expect(r.route).toBe("docling_ocr");
  });

  it("routes Mixed to hybrid_docling", () => {
    const r = recommendPdfRoute({
      pdfType: "Mixed",
      confidence: 0.9,
      pagesNeedingOcr: [3],
    });
    expect(r.route).toBe("hybrid_docling");
  });
});

describe("runInspectPdfWithApi", () => {
  it("detect mode returns classification + route", async () => {
    const result = await runInspectPdfWithApi(
      { mode: "detect", base64: Buffer.from("%PDF-1.4").toString("base64") },
      {
        classifyPdf: () => ({
          pdfType: "TextBased",
          pageCount: 2,
          pagesNeedingOcr: [],
          confidence: 0.99,
        }),
        processPdf: () => {
          throw new Error("should not call processPdf in detect mode");
        },
      }
    );
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("detect");
    expect(result.pdf_type).toBe("TextBased");
    expect(result.route).toBe("local_markdown");
    expect(result.markdown).toBeUndefined();
  });

  it("full mode includes markdown for TextBased", async () => {
    const result = await runInspectPdfWithApi(
      { mode: "full", base64: Buffer.from("%PDF-1.4").toString("base64") },
      {
        classifyPdf: () => {
          throw new Error("should not classify in full mode");
        },
        processPdf: () => ({
          pdfType: "TextBased",
          markdown: "# Hello",
          pageCount: 1,
          processingTimeMs: 12,
          pagesNeedingOcr: [],
          confidence: 1,
          isComplexLayout: false,
          pagesWithTables: [],
          pagesWithColumns: [],
          hasEncodingIssues: false,
        }),
      }
    );
    expect(result.ok).toBe(true);
    expect(result.markdown).toBe("# Hello");
    expect(result.route).toBe("local_markdown");
  });
});
