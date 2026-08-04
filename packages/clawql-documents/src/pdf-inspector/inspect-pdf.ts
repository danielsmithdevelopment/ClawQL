import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { Effect } from "effect";
import { pdfInspectorLocalMarkdownMinConfidence, pdfInspectorToolEnabled } from "./env.js";
import { readPdfPathAllowlisted } from "./read-path.js";
import {
  decodeInspectPdfInput,
  inspectPdfToolZodShape,
  type InspectPdfInputDecoded,
} from "../schema/index.js";

/** @deprecated Prefer {@link inspectPdfToolZodShape}. */
export const inspectPdfToolSchema = inspectPdfToolZodShape;

export type PdfRouteRecommendation = "local_markdown" | "docling_ocr" | "hybrid_docling";

export type InspectPdfResult = {
  ok: boolean;
  provider?: "pdf-inspector";
  mode?: "detect" | "full";
  pdf_type?: string;
  confidence?: number;
  page_count?: number;
  pages_needing_ocr?: number[];
  processing_time_ms?: number;
  is_complex_layout?: boolean;
  pages_with_tables?: number[];
  pages_with_columns?: number[];
  has_encoding_issues?: boolean;
  markdown?: string;
  route?: PdfRouteRecommendation;
  route_reason?: string;
  error?: string;
};

export function recommendPdfRoute(input: {
  pdfType: string;
  confidence: number;
  pagesNeedingOcr: readonly number[];
  hasEncodingIssues?: boolean;
}): { route: PdfRouteRecommendation; reason: string } {
  const minConf = pdfInspectorLocalMarkdownMinConfidence();
  const type = input.pdfType;
  if (type === "Scanned" || type === "ImageBased") {
    return {
      route: "docling_ocr",
      reason: `${type} PDFs need layout OCR (Docling); pdf-inspector does not run OCR.`,
    };
  }
  if (type === "Mixed" || input.pagesNeedingOcr.length > 0 || input.hasEncodingIssues) {
    return {
      route: "hybrid_docling",
      reason:
        "Some pages need OCR or have encoding issues — use Docling for those pages; local markdown may still help for text pages.",
    };
  }
  if (type === "TextBased" && input.confidence >= minConf) {
    return {
      route: "local_markdown",
      reason: `TextBased at confidence ${input.confidence} ≥ ${minConf}; prefer local markdown and skip Docling OCR.`,
    };
  }
  return {
    route: "docling_ocr",
    reason: `Confidence ${input.confidence} below local threshold ${minConf}; route to Docling.`,
  };
}

type PdfInspectorApi = {
  classifyPdf: (buffer: Buffer) => {
    pdfType: string;
    pageCount: number;
    pagesNeedingOcr: number[];
    confidence: number;
  };
  processPdf: (buffer: Buffer) => {
    pdfType: string;
    markdown?: string;
    pageCount: number;
    processingTimeMs: number;
    pagesNeedingOcr: number[];
    confidence: number;
    isComplexLayout: boolean;
    pagesWithTables: number[];
    pagesWithColumns: number[];
    hasEncodingIssues: boolean;
  };
};

async function loadPdfInspector(): Promise<PdfInspectorApi> {
  try {
    const mod = (await import("@firecrawl/pdf-inspector")) as PdfInspectorApi;
    return mod;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load @firecrawl/pdf-inspector (native napi binding). Install platform binaries or set CLAWQL_ENABLE_PDF_INSPECTOR=0. ${msg}`,
      { cause: err }
    );
  }
}

async function resolvePdfBuffer(input: InspectPdfInputDecoded): Promise<Buffer> {
  if ("base64" in input && input.base64) {
    const buf = Buffer.from(input.base64, "base64");
    if (buf.length === 0) throw new Error("base64 decoded to empty buffer");
    if (buf.length > 100 * 1024 * 1024) throw new Error("pdf exceeds 100 MiB limit");
    return buf;
  }
  if ("path" in input && input.path) {
    return readPdfPathAllowlisted(input.path);
  }
  throw new Error("provide path or base64");
}

/** Core inspect — used by tests with an injected API. */
export async function runInspectPdfWithApi(
  input: InspectPdfInputDecoded,
  api: PdfInspectorApi
): Promise<InspectPdfResult> {
  const mode = input.mode ?? "full";
  const buffer = await resolvePdfBuffer(input);
  if (mode === "detect") {
    const c = api.classifyPdf(buffer);
    const { route, reason } = recommendPdfRoute({
      pdfType: String(c.pdfType),
      confidence: c.confidence,
      pagesNeedingOcr: c.pagesNeedingOcr,
    });
    return {
      ok: true,
      provider: "pdf-inspector",
      mode,
      pdf_type: String(c.pdfType),
      confidence: c.confidence,
      page_count: c.pageCount,
      pages_needing_ocr: c.pagesNeedingOcr,
      route,
      route_reason: reason,
    };
  }
  const p = api.processPdf(buffer);
  const { route, reason } = recommendPdfRoute({
    pdfType: String(p.pdfType),
    confidence: p.confidence,
    pagesNeedingOcr: p.pagesNeedingOcr,
    hasEncodingIssues: p.hasEncodingIssues,
  });
  const includeMd = input.include_markdown !== false && route !== "docling_ocr";
  return {
    ok: true,
    provider: "pdf-inspector",
    mode,
    pdf_type: String(p.pdfType),
    confidence: p.confidence,
    page_count: p.pageCount,
    pages_needing_ocr: p.pagesNeedingOcr,
    processing_time_ms: p.processingTimeMs,
    is_complex_layout: p.isComplexLayout,
    pages_with_tables: p.pagesWithTables,
    pages_with_columns: p.pagesWithColumns,
    has_encoding_issues: p.hasEncodingIssues,
    markdown: includeMd ? p.markdown : undefined,
    route,
    route_reason: reason,
  };
}

export async function executeInspectPdf(input: InspectPdfInputDecoded): Promise<InspectPdfResult> {
  if (!pdfInspectorToolEnabled()) {
    return {
      ok: false,
      error:
        "inspect_pdf is disabled. Set CLAWQL_ENABLE_PDF_INSPECTOR=1 (requires CLAWQL_ENABLE_DOCUMENTS=1).",
    };
  }
  try {
    const api = await loadPdfInspector();
    return await runInspectPdfWithApi(input, api);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function handleInspectPdfToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = await Effect.runPromise(decodeInspectPdfInput(params));
  logMcpToolShape("inspect_pdf", {
    mode: parsed.mode ?? "full",
    hasPath: "path" in parsed && Boolean(parsed.path),
    hasBase64: "base64" in parsed && Boolean(parsed.base64),
    includeMarkdown: parsed.include_markdown !== false,
  });
  const result = await executeInspectPdf(parsed);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
