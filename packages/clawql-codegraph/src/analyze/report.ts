import type { CodeGraphDocument, CodeGraphNode } from "../types.js";
import type { CodeGraphCommunity } from "./cluster.js";

export type GodNode = {
  readonly nodeId: string;
  readonly name: string;
  readonly kind: CodeGraphNode["kind"];
  readonly filePath?: string;
  readonly degree: number;
};

export type ArchitectureReportInput = {
  readonly repoName: string;
  readonly document: CodeGraphDocument;
  readonly communities: readonly CodeGraphCommunity[];
  readonly modularity?: number;
  readonly algorithm?: string;
  readonly commit?: string;
};

/** Degree = inbound + outbound edge endpoints for a node. */
export function rankGodNodes(doc: CodeGraphDocument, topN = 10): GodNode[] {
  const degrees = new Map<string, number>();
  for (const id of Object.keys(doc.nodes)) degrees.set(id, 0);
  for (const e of doc.edges) {
    degrees.set(e.from, (degrees.get(e.from) ?? 0) + 1);
    degrees.set(e.to, (degrees.get(e.to) ?? 0) + 1);
  }
  return [...degrees.entries()]
    .map(([nodeId, degree]) => {
      const node = doc.nodes[nodeId]!;
      return {
        nodeId,
        name: node.name,
        kind: node.kind,
        filePath: node.filePath,
        degree,
      };
    })
    .sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name))
    .slice(0, topN);
}

/** Human-readable architecture report (Graphify GRAPH_REPORT.md analogue). */
export function renderArchitectureReport(input: ArchitectureReportInput): string {
  const { document: doc, communities, repoName } = input;
  const date = new Date().toISOString().slice(0, 10);
  const gods = rankGodNodes(doc, 10);
  const confCounts = { EXTRACTED: 0, INFERRED: 0, AMBIGUOUS: 0 };
  for (const e of doc.edges) confCounts[e.confidence] += 1;
  const edgeTotal = doc.edges.length || 1;

  const communityLines =
    communities.length === 0
      ? ["- (no communities)"]
      : communities.slice(0, 20).map((c) => {
          const samples = c.sampleLabels.length
            ? ` — e.g. ${c.sampleLabels.slice(0, 4).join(", ")}`
            : "";
          return `- **${c.name}** (nodes=${c.nodeCount})${samples}`;
        });

  const godLines =
    gods.length === 0
      ? ["- (none)"]
      : gods.map(
          (g, i) =>
            `${i + 1}. \`${g.name}\` (${g.kind}${g.filePath ? `, ${g.filePath}` : ""}) — ${g.degree} edges`
        );

  return [
    `# Graph Report - ${repoName}  (${date})`,
    ``,
    `## Summary`,
    `- ${doc.nodeCount} nodes · ${doc.edgeCount} edges · ${communities.length} communities`,
    `- Clustering: **${input.algorithm ?? "louvain"}**` +
      (typeof input.modularity === "number" ? ` (modularity ${input.modularity.toFixed(3)})` : ""),
    `- Edge confidence: ${((confCounts.EXTRACTED / edgeTotal) * 100).toFixed(0)}% EXTRACTED · ${((confCounts.INFERRED / edgeTotal) * 100).toFixed(0)}% INFERRED · ${((confCounts.AMBIGUOUS / edgeTotal) * 100).toFixed(0)}% AMBIGUOUS`,
    `- Generator: clawql-codegraph (TypeScript native)`,
    ``,
    `## Graph Freshness`,
    input.commit ? `- Built from commit: \`${input.commit}\`` : `- Built at: \`${doc.builtAt}\``,
    `- Re-run \`codegraph_sync\` after major structural changes.`,
    ``,
    `## Community Hubs (Navigation)`,
    ...communityLines,
    ``,
    `## God Nodes (most connected)`,
    ...godLines,
    ``,
    `## Notes`,
    `- Communities are Louvain clusters over the undirected projection of the code graph.`,
    `- Numbered community labels are placeholders; rename via vault notes or a future LLM labeling pass.`,
    ``,
  ].join("\n");
}
