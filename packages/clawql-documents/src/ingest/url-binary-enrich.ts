/**
 * Enrich binary URL ingest (PDF / Office) via pdf-inspector / anydoc when enabled.
 * Falls back to base64 vault notes so pdf-inspector / Docling can still consume bytes later.
 */

import { executeConvertDocument } from "../anydoc/convert-document.js";
import { anydocToolEnabled } from "../anydoc/env.js";
import { executeInspectPdf } from "../pdf-inspector/inspect-pdf.js";
import { pdfInspectorToolEnabled } from "../pdf-inspector/env.js";

export type BinaryEnrichKind = "markdown" | "binary";

export type BinaryEnrichResult = {
  kind: BinaryEnrichKind;
  title: string;
  /** Markdown body (no YAML). */
  bodyMarkdown: string;
  /** Frontmatter extras (stringified by caller). */
  meta: Record<string, string | number | boolean | undefined | null>;
};

function hostnameHint(urlStr: string): string {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return "external";
  }
}

export function isBinaryDocumentContentType(contentType: string | null): boolean {
  const ct = (contentType ?? "").toLowerCase();
  return (
    ct.includes("application/pdf") ||
    ct.includes("application/msword") ||
    ct.includes("application/vnd.openxmlformats") ||
    ct.includes("application/vnd.ms-") ||
    ct.includes("application/octet-stream")
  );
}

function isPdfContentType(contentType: string | null, bytes: Uint8Array): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("application/pdf")) return true;
  // %PDF-
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function base64Body(bytes: Uint8Array, preface: string): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return [preface, "", "```base64", b64, "```", ""].join("\n");
}

/** Attempt local classify/convert; otherwise preserve raw bytes as base64. */
export async function enrichBinaryUrlIngest(
  bytes: Uint8Array,
  contentType: string | null,
  sourceUrl: string
): Promise<BinaryEnrichResult> {
  const host = hostnameHint(sourceUrl);
  const ct = contentType ?? "application/octet-stream";

  if (isPdfContentType(contentType, bytes) && pdfInspectorToolEnabled()) {
    const inspected = await executeInspectPdf({
      base64: Buffer.from(bytes).toString("base64"),
      mode: "full",
      include_markdown: true,
    });
    if (inspected.ok && inspected.markdown?.trim()) {
      return {
        kind: "markdown",
        title: `PDF · ${host}`,
        bodyMarkdown: inspected.markdown.trimEnd() + "\n",
        meta: {
          clawql_external_ingest_kind: "pdf",
          content_type: ct,
          byte_length: bytes.byteLength,
          pdf_type: inspected.pdf_type,
          confidence: inspected.confidence,
          route: inspected.route,
          route_reason: inspected.route_reason,
          provider: "pdf-inspector",
        },
      };
    }
    // Classified but needs Docling / no markdown — keep bytes + route for pipeline handoff
    const preface = inspected.ok
      ? [
          "PDF classified by pdf-inspector; local markdown not used.",
          "",
          `- pdf_type: ${inspected.pdf_type ?? "?"}`,
          `- route: ${inspected.route ?? "?"}`,
          `- reason: ${inspected.route_reason ?? "?"}`,
          "",
          "Raw bytes preserved for Docling / downstream IDP stages (base64).",
        ].join("\n")
      : `pdf-inspector unavailable (${inspected.error ?? "unknown"}). Raw bytes preserved (base64).`;
    return {
      kind: "binary",
      title: `PDF · ${host}`,
      bodyMarkdown: base64Body(bytes, preface),
      meta: {
        clawql_external_ingest_kind: "binary",
        content_type: ct,
        byte_length: bytes.byteLength,
        pdf_type: inspected.pdf_type,
        confidence: inspected.confidence,
        route: inspected.route,
        route_reason: inspected.route_reason,
        provider: inspected.ok ? "pdf-inspector" : undefined,
        enrich_error: inspected.ok ? undefined : inspected.error,
      },
    };
  }

  if (anydocToolEnabled()) {
    const converted = await executeConvertDocument({
      base64: Buffer.from(bytes).toString("base64"),
      format: contentType?.includes("pdf") ? "pdf" : undefined,
      include_markdown: true,
    });
    if (converted.ok && converted.markdown?.trim()) {
      return {
        kind: "markdown",
        title: `Document · ${host}`,
        bodyMarkdown: converted.markdown.trimEnd() + "\n",
        meta: {
          clawql_external_ingest_kind: "document",
          content_type: ct,
          byte_length: bytes.byteLength,
          format: converted.format,
          route: converted.route,
          route_reason: converted.route_reason,
          provider: "anydoc",
        },
      };
    }
    const preface = converted.ok
      ? "anydoc produced no markdown. Raw bytes preserved (base64)."
      : `anydoc skipped/failed (${converted.error ?? "unknown"}). Raw bytes preserved (base64).`;
    return {
      kind: "binary",
      title: `Binary · ${host}`,
      bodyMarkdown: base64Body(bytes, preface),
      meta: {
        clawql_external_ingest_kind: "binary",
        content_type: ct,
        byte_length: bytes.byteLength,
        route: converted.route,
        route_reason: converted.route_reason,
        enrich_error: converted.ok ? undefined : converted.error,
      },
    };
  }

  return {
    kind: "binary",
    title: `Binary · ${host}`,
    bodyMarkdown: base64Body(
      bytes,
      "Raw bytes preserved for pdf-inspector / anydoc / Docling (base64)."
    ),
    meta: {
      clawql_external_ingest_kind: "binary",
      content_type: ct,
      byte_length: bytes.byteLength,
    },
  };
}

export function buildEnrichedUrlIngestNote(
  sourceUrl: string,
  enriched: BinaryEnrichResult,
  fetchedAt: string
): string {
  const lines = [
    "---",
    `title: ${JSON.stringify(enriched.title)}`,
    `date: ${fetchedAt}`,
    "tags: [clawql-external-ingest]",
    "clawql_external_ingest: true",
    `source_url: ${JSON.stringify(sourceUrl)}`,
  ];
  for (const [k, v] of Object.entries(enriched.meta)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push("---", "", enriched.bodyMarkdown.trimEnd(), "");
  return lines.join("\n");
}
