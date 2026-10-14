function envTruthy(raw: string | undefined): boolean {
  const t = raw?.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/** Infer human-readable spec / provider mode from environment (no spec load). */
export function inferSpecMode(): string {
  const sqliteLoad = (process.env.CLAWQL_CATALOG_SQLITE_LOAD ?? "").trim().toLowerCase();
  if (
    envTruthy(process.env.CLAWQL_CATALOG_SQLITE) &&
    (sqliteLoad === "db" || sqliteLoad === "sqlite")
  ) {
    return "catalog-sqlite";
  }
  if (
    process.env.CLAWQL_SPEC_PATH?.trim() ||
    process.env.CLAWQL_SPEC_URL?.trim() ||
    process.env.CLAWQL_DISCOVERY_URL?.trim()
  ) {
    return "single-spec";
  }
  if (process.env.CLAWQL_SPEC_PATHS?.trim()) return "CLAWQL_SPEC_PATHS";
  if (process.env.CLAWQL_BUNDLED_PROVIDERS?.trim()) return "CLAWQL_BUNDLED_PROVIDERS";
  if (process.env.CLAWQL_PROVIDER?.trim())
    return `CLAWQL_PROVIDER=${process.env.CLAWQL_PROVIDER.trim()}`;
  return "default stack (Cloudflare, GitHub, Slack, Linear, Notion, Onyx)";
}
