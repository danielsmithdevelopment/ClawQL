import { afterEach, describe, expect, it } from "vitest";
import {
  buildEnrichedUrlIngestNote,
  enrichBinaryUrlIngest,
  isBinaryDocumentContentType,
} from "./url-binary-enrich.js";

describe("url-binary-enrich", () => {
  afterEach(() => {
    delete process.env.CLAWQL_ENABLE_PDF_INSPECTOR;
    delete process.env.CLAWQL_ENABLE_ANYDOC;
  });

  it("detects binary content types", () => {
    expect(isBinaryDocumentContentType("application/pdf")).toBe(true);
    expect(
      isBinaryDocumentContentType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
    expect(isBinaryDocumentContentType("text/html")).toBe(false);
  });

  it("preserves base64 when inspectors are disabled", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 fake");
    const enriched = await enrichBinaryUrlIngest(
      bytes,
      "application/pdf",
      "https://example.com/a.pdf"
    );
    expect(enriched.kind).toBe("binary");
    expect(enriched.bodyMarkdown).toContain("```base64");
    expect(enriched.meta.byte_length).toBe(bytes.byteLength);
    const note = buildEnrichedUrlIngestNote(
      "https://example.com/a.pdf",
      enriched,
      "2026-01-01T00:00:00.000Z"
    );
    expect(note).toContain("clawql_external_ingest: true");
    expect(note).toMatch(/clawql_external_ingest_kind:\s*"?binary"?/);
  });
});
