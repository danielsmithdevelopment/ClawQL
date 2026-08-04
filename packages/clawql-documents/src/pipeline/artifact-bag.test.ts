import { describe, expect, it } from "vitest";

import {
  enrichStepArgsWithArtifacts,
  extractBase64Artifact,
  sanitizeArgsForHopResult,
} from "./artifact-bag.js";

describe("artifact-bag", () => {
  it("extracts base64 encoding wrapper from execute excerpt", () => {
    const pdf = Buffer.from("%PDF-1.4 demo").toString("base64");
    const excerpt = JSON.stringify({
      encoding: "base64",
      data: pdf,
      contentType: "application/pdf",
    });
    expect(extractBase64Artifact(excerpt)).toBe(pdf);
  });

  it("injects Stirling redact args from bag", () => {
    const pdf = "JVBERi0x";
    const args = enrichStepArgsWithArtifacts(
      "stirling::redactPdfAuto",
      "stirling",
      {},
      { pdfBase64: pdf, redactList: "SSN,EIN" }
    );
    expect(args.fileInput).toBe(pdf);
    expect(args.fileInputEncoding).toBe("base64");
    expect(args.listOfText).toBe("SSN,EIN");
    expect(args.useRegex).toBe(true);
  });

  it("injects Nextcloud upload body from bag", () => {
    const pdf = "JVBERi0x";
    const args = enrichStepArgsWithArtifacts(
      "nextcloud::nextcloud_webdav_upload",
      "nextcloud",
      { username: "admin", filePath: "IDP/processed/doc.pdf" },
      { pdfBase64: pdf, redactList: "" }
    );
    expect(args.body).toBe(pdf);
    expect(args.bodyEncoding).toBe("base64");
  });

  it("sanitizes large base64 args for hop results", () => {
    const big = "A".repeat(300);
    const out = sanitizeArgsForHopResult({ fileInput: big, listOfText: "SSN" });
    expect(out.fileInput).toBe("<base64 300 chars>");
    expect(out.listOfText).toBe("SSN");
  });
});
