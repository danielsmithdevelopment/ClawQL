/**
 * Hop-to-hop PDF / redact artifacts for {@link runIdpPipelineEffect}.
 */

export type PipelineArtifactBag = {
  pdfBase64?: string;
  redactList: string;
};

/** Extract base64 PDF (or other binary) from an execute response excerpt. */
export function extractBase64Artifact(excerpt: string | undefined): string | undefined {
  if (!excerpt?.trim()) return undefined;
  try {
    const parsed = JSON.parse(excerpt) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.encoding === "base64" &&
      typeof parsed.data === "string" &&
      parsed.data.length > 0
    ) {
      return parsed.data;
    }
    // Some providers wrap under `data` already as base64 string with contentType.
    if (
      typeof parsed?.contentType === "string" &&
      /pdf|octet-stream/i.test(parsed.contentType) &&
      typeof parsed.data === "string"
    ) {
      return parsed.data;
    }
  } catch {
    /* non-JSON */
  }
  return undefined;
}

/**
 * Inject artifact bag into Stirling / Nextcloud upload args when templates left
 * placeholders empty or omitted.
 */
export function enrichStepArgsWithArtifacts(
  operationId: string,
  stage: string,
  args: Record<string, unknown>,
  bag: PipelineArtifactBag
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };

  const needsPdf =
    stage === "stirling" ||
    operationId.includes("redactPdf") ||
    operationId.includes("webdav_upload") ||
    operationId.includes("gotenberg");

  if (needsPdf && bag.pdfBase64) {
    if (operationId.includes("redactPdf") || stage === "stirling") {
      if (!out.fileInput || out.fileInput === "") {
        out.fileInput = bag.pdfBase64;
        out.fileInputEncoding = out.fileInputEncoding ?? "base64";
        out.fileInputFileName = out.fileInputFileName ?? "document.pdf";
      }
      if (!out.listOfText || out.listOfText === "") {
        out.listOfText = bag.redactList;
      }
      if (out.useRegex === undefined) out.useRegex = true;
      if (out.wholeWordSearch === undefined) out.wholeWordSearch = false;
      if (out.redactColor === undefined) out.redactColor = "#000000";
      if (out.customPadding === undefined) out.customPadding = 0.1;
      if (out.convertPDFToImage === undefined) out.convertPDFToImage = false;
    }
    if (operationId.includes("webdav_upload")) {
      if (!out.body || out.body === "") {
        out.body = bag.pdfBase64;
        out.bodyEncoding = out.bodyEncoding ?? "base64";
        out.bodyContentType = out.bodyContentType ?? "application/pdf";
      }
    }
  }

  return out;
}

/** Shrink large base64 fields before persisting hop args in pipeline results. */
export function sanitizeArgsForHopResult(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string" && v.length > 256 && /^[A-Za-z0-9+/=\s]+$/.test(v.slice(0, 80))) {
      out[k] = `<base64 ${v.length} chars>`;
    } else {
      out[k] = v;
    }
  }
  return out;
}
