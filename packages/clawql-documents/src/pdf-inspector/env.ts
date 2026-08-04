/**
 * Env gates for in-process pdf-inspector ([Firecrawl](https://github.com/firecrawl/pdf-inspector)).
 */
function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function pdfInspectorToolEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_ENABLE_PDF_INSPECTOR);
}

/** Min confidence to recommend local markdown instead of Docling OCR (default 0.85). */
export function pdfInspectorLocalMarkdownMinConfidence(): number {
  const raw = process.env.CLAWQL_PDF_INSPECTOR_LOCAL_MIN_CONFIDENCE?.trim();
  if (!raw) return 0.85;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.85;
}

/**
 * Allowed directory prefixes for `path` input (colon/comma/newline separated).
 * Default: process cwd realpath.
 */
export function pdfInspectorFileRootsEnv(): string | undefined {
  return process.env.CLAWQL_PDF_INSPECTOR_FILE_ROOTS?.trim() || undefined;
}
