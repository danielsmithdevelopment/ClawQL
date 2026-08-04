/**
 * CodeGraph → vault flywheel: turn impact analysis into type:code_change OKF notes.
 * Enabled by default when CLAWQL_CODEGRAPH_CODE_CHANGE_INGEST is unset;
 * set to 0/false/off to disable.
 */

export function codeChangeVaultFlywheelEnabled(): boolean {
  const v = process.env.CLAWQL_CODEGRAPH_CODE_CHANGE_INGEST?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

export type ImpactLike = {
  seedQuery: string;
  seedNodeId?: string;
  depth: number;
  impacted: readonly {
    nodeId: string;
    name: string;
    kind: string;
    filePath?: string;
    distance: number;
  }[];
  files: readonly string[];
};

export type CodeChangeIngestProposal = {
  title: string;
  type: "code_change";
  description: string;
  insights: string;
  wikilinks: string[];
  tags: string[];
  toolOutputs: string;
  append: true;
};

/**
 * Build a memory_ingest proposal from a codegraph impact result.
 * Returns null when there is nothing meaningful to record.
 */
export function buildCodeChangeIngestProposal(
  impact: ImpactLike,
  opts?: { reasoning?: string; correlationId?: string }
): CodeChangeIngestProposal | null {
  if (!impact.seedNodeId && impact.impacted.length === 0 && impact.files.length === 0) {
    return null;
  }
  const seed = impact.seedQuery.trim() || "unknown-symbol";
  const symbols = [seed, ...impact.impacted.slice(0, 24).map((h) => h.name)];
  const uniqueSymbols = [...new Set(symbols)].slice(0, 30);
  const files = [...impact.files].slice(0, 40);
  const title = `code_change: ${seed} impact (depth ${impact.depth})`;
  const reasoning = opts?.reasoning?.trim();
  const insights = [
    "## Impact",
    "",
    `- **Seed:** \`${seed}\`${impact.seedNodeId ? ` (\`${impact.seedNodeId}\`)` : ""}`,
    `- **Depth:** ${impact.depth}`,
    `- **Impacted symbols:** ${impact.impacted.length}`,
    `- **Files:** ${files.length}`,
    "",
    ...(reasoning ? ["## Reasoning", "", reasoning, ""] : []),
    "## Affected symbols",
    "",
    ...uniqueSymbols.map((s) => `- \`${s}\``),
    "",
    "## Affected files",
    "",
    ...(files.length ? files.map((f) => `- \`${f}\``) : ["- _(none)_"]),
    "",
    "<!-- clawql-code-change -->",
  ].join("\n");

  return {
    title,
    type: "code_change",
    description: `CodeGraph impact for ${seed}: ${impact.impacted.length} symbols, ${files.length} files`,
    insights,
    wikilinks: ["Codegraph Impact", seed],
    tags: ["codegraph", "code-change", "impact"],
    toolOutputs: JSON.stringify(
      {
        seedQuery: impact.seedQuery,
        seedNodeId: impact.seedNodeId,
        depth: impact.depth,
        impacted: impact.impacted.slice(0, 50),
        files,
        correlationId: opts?.correlationId,
      },
      null,
      2
    ),
    append: true,
  };
}
