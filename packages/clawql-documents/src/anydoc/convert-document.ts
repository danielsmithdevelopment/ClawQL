import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { Effect } from "effect";
import { extname } from "node:path";
import { anydocToolEnabled } from "./env.js";
import { readAnydocPathAllowlisted } from "./read-path.js";
import {
  decodeConvertDocumentInput,
  convertDocumentToolZodShape,
  type ConvertDocumentInputDecoded,
} from "../schema/index.js";

/** @deprecated Prefer {@link convertDocumentToolZodShape}. */
export const convertDocumentToolSchema = convertDocumentToolZodShape;

export type ConvertRouteRecommendation = "local_markdown" | "docling_ocr" | "tika_fallback";

export type ConvertDocumentResult = {
  ok: boolean;
  provider?: "anydoc";
  format?: string | null;
  markdown?: string;
  processing_time_ms?: number;
  route?: ConvertRouteRecommendation;
  route_reason?: string;
  error?: string;
};

type AnydocApi = {
  toMarkdown: (path: string) => Promise<string>;
  toMarkdownBytes: (bytes: Uint8Array, format?: string | null) => Promise<string>;
  formatFromBytes: (bytes: Uint8Array) => string | null;
  formatFromPath: (path: string) => string | null;
  formatFromExtension: (extension: string) => string | null;
};

async function loadAnydoc(): Promise<AnydocApi> {
  try {
    const mod = (await import("@firecrawl/anydoc")) as AnydocApi;
    return mod;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load @firecrawl/anydoc (native napi binding). Install platform binaries or set CLAWQL_ENABLE_ANYDOC=0. ${msg}`,
      { cause: err }
    );
  }
}

function looksLikeOcrNeeded(errMsg: string): boolean {
  const m = errMsg.toLowerCase();
  return (
    m.includes("ocr") ||
    m.includes("scanned") ||
    m.includes("image-only") ||
    m.includes("image based") ||
    (m.includes("unsupported") && m.includes("pdf"))
  );
}

export function recommendConvertRoute(input: {
  ok: boolean;
  format?: string | null;
  error?: string;
}): { route: ConvertRouteRecommendation; reason: string } {
  if (input.ok) {
    return {
      route: "local_markdown",
      reason: "anydoc produced GFM markdown — prefer local path; skip Docling OCR for native text.",
    };
  }
  if (input.error && looksLikeOcrNeeded(input.error)) {
    return {
      route: "docling_ocr",
      reason: "anydoc could not convert locally (likely scanned/image PDF) — use Docling OCR.",
    };
  }
  return {
    route: "tika_fallback",
    reason: "anydoc failed — try Tika metadata/text extract or Docling for layout.",
  };
}

async function resolveBytes(
  input: ConvertDocumentInputDecoded
): Promise<{ buffer: Buffer; pathHint?: string; formatHint?: string | null }> {
  if ("base64" in input && input.base64) {
    const buf = Buffer.from(input.base64, "base64");
    if (buf.length === 0) throw new Error("base64 decoded to empty buffer");
    if (buf.length > 100 * 1024 * 1024) throw new Error("document exceeds 100 MiB limit");
    return { buffer: buf, formatHint: input.format ?? null };
  }
  if ("path" in input && input.path) {
    const buffer = await readAnydocPathAllowlisted(input.path);
    return { buffer, pathHint: input.path, formatHint: input.format ?? null };
  }
  throw new Error("provide path or base64");
}

function resolveFormat(
  api: AnydocApi,
  buffer: Buffer,
  pathHint?: string,
  formatHint?: string | null
): string | null {
  if (formatHint?.trim()) {
    return formatHint.trim().replace(/^\./, "").toLowerCase();
  }
  const fromBytes = api.formatFromBytes(buffer);
  if (fromBytes) return String(fromBytes);
  if (pathHint) {
    const fromPath = api.formatFromPath(pathHint);
    if (fromPath) return String(fromPath);
    const ext = extname(pathHint);
    if (ext) {
      const fromExt = api.formatFromExtension(ext);
      if (fromExt) return String(fromExt);
    }
  }
  return null;
}

/** Core convert — used by tests with an injected API. */
export async function runConvertDocumentWithApi(
  input: ConvertDocumentInputDecoded,
  api: AnydocApi
): Promise<ConvertDocumentResult> {
  const t0 = Date.now();
  try {
    const { buffer, pathHint, formatHint } = await resolveBytes(input);
    const format = resolveFormat(api, buffer, pathHint, formatHint);
    const markdown = await api.toMarkdownBytes(buffer, format);
    const { route, reason } = recommendConvertRoute({ ok: true, format });
    return {
      ok: true,
      provider: "anydoc",
      format,
      markdown: input.include_markdown === false ? undefined : markdown,
      processing_time_ms: Date.now() - t0,
      route,
      route_reason: reason,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const { route, reason } = recommendConvertRoute({ ok: false, error });
    return {
      ok: false,
      provider: "anydoc",
      processing_time_ms: Date.now() - t0,
      route,
      route_reason: reason,
      error,
    };
  }
}

export async function executeConvertDocument(
  input: ConvertDocumentInputDecoded
): Promise<ConvertDocumentResult> {
  if (!anydocToolEnabled()) {
    return {
      ok: false,
      error:
        "convert_document is disabled. Set CLAWQL_ENABLE_ANYDOC=1 (requires CLAWQL_ENABLE_DOCUMENTS=1).",
    };
  }
  try {
    const api = await loadAnydoc();
    return await runConvertDocumentWithApi(input, api);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function handleConvertDocumentToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = await Effect.runPromise(decodeConvertDocumentInput(params));
  logMcpToolShape("convert_document", {
    hasPath: "path" in parsed && Boolean(parsed.path),
    hasBase64: "base64" in parsed && Boolean(parsed.base64),
    format: parsed.format ?? null,
    includeMarkdown: parsed.include_markdown !== false,
  });
  const result = await executeConvertDocument(parsed);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
