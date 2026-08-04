/**
 * Env gates for in-process Firecrawl anydoc ([anydoc](https://github.com/firecrawl/anydoc)).
 */
function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function anydocToolEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_ENABLE_ANYDOC);
}

/**
 * Allowed directory prefixes for `path` input (colon/comma/newline separated).
 * Falls back to `CLAWQL_PDF_INSPECTOR_FILE_ROOTS`, then process cwd.
 */
export function anydocFileRootsEnv(): string | undefined {
  return (
    process.env.CLAWQL_ANYDOC_FILE_ROOTS?.trim() ||
    process.env.CLAWQL_PDF_INSPECTOR_FILE_ROOTS?.trim() ||
    undefined
  );
}
