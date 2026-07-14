export type CodeGraphBackend = "native" | "graphify";

export function codeGraphBackend(): CodeGraphBackend {
  const v = process.env.CLAWQL_CODEGRAPH_BACKEND?.trim().toLowerCase();
  return v === "graphify" ? "graphify" : "native";
}

/** Path to Graphify graph.json when backend is graphify or for import. */
export function graphifyJsonPath(): string | undefined {
  const v = process.env.CLAWQL_CODEGRAPH_GRAPHIFY_JSON?.trim();
  return v || undefined;
}

/** Optional shell command to refresh graph.json (e.g. graphify CLI). */
export function graphifyRefreshCommand(): string | undefined {
  const v = process.env.CLAWQL_CODEGRAPH_GRAPHIFY_REFRESH_CMD?.trim();
  return v || undefined;
}

export function defaultCodeGraphId(): string {
  const v = process.env.CLAWQL_CODEGRAPH_ID?.trim();
  if (v) return v;
  const path = graphifyJsonPath();
  if (path) {
    const base = path.split("/").pop()?.replace(/\.json$/i, "") ?? "graphify";
    return `${base}-codegraph`;
  }
  return "repo-codegraph";
}
