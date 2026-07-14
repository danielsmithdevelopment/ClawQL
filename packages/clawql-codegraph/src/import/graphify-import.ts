import type {
  CodeGraphDocument,
  CodeGraphEdge,
  CodeGraphEdgeConfidence,
  CodeGraphEdgeKind,
  CodeGraphNode,
  CodeGraphNodeKind,
} from "../types.js";
import { buildAdjacencyFromEdges } from "./graph-utils.js";

export type GraphifyNode = {
  id: string;
  label?: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  [key: string]: unknown;
};

export type GraphifyEdge = {
  source: string;
  target: string;
  relation?: string;
  confidence?: string;
  source_file?: string;
  [key: string]: unknown;
};

export type GraphifyGraphJson = {
  nodes?: GraphifyNode[];
  edges?: GraphifyEdge[];
  links?: GraphifyEdge[];
  directed?: boolean;
  multigraph?: boolean;
  graph?: Record<string, unknown>;
};

function parseLine(sourceLocation?: string): number | undefined {
  if (!sourceLocation) return undefined;
  const m = sourceLocation.match(/L(\d+)/i);
  return m ? Number.parseInt(m[1]!, 10) : undefined;
}

function mapNodeKind(fileType?: string, label?: string): CodeGraphNodeKind {
  const ft = (fileType ?? "").toLowerCase();
  if (ft === "code") {
    if (label && /^[A-Z]/.test(label)) return "class";
    return "function";
  }
  if (ft === "document" || ft === "paper") return "module";
  if (ft === "rationale" || ft === "concept") return "type";
  return "variable";
}

function mapEdgeKind(relation?: string): CodeGraphEdgeKind {
  const r = (relation ?? "references").toLowerCase();
  if (r.includes("import")) return "imports";
  if (r.includes("export")) return "exports";
  if (r.includes("call")) return "calls";
  if (r.includes("inherit") || r.includes("extends")) return "extends";
  if (r.includes("implement")) return "implements";
  if (r.includes("contain")) return "contains";
  return "references";
}

function mapConfidence(raw?: string): CodeGraphEdgeConfidence {
  const c = (raw ?? "INFERRED").toUpperCase();
  if (c === "EXTRACTED") return "EXTRACTED";
  if (c === "AMBIGUOUS") return "AMBIGUOUS";
  return "INFERRED";
}

/** Convert Graphify / NetworkX node-link JSON into a ClawQL CodeGraphDocument. */
export function importGraphifyJson(
  raw: GraphifyGraphJson,
  options: { graphId: string; rootPath?: string }
): CodeGraphDocument {
  const nodesArr = raw.nodes ?? [];
  const edgesArr = raw.edges ?? raw.links ?? [];
  const nodes: Record<string, CodeGraphNode> = {};

  for (const n of nodesArr) {
    if (!n.id) continue;
    const label = n.label ?? n.id;
    nodes[n.id] = {
      id: n.id,
      kind: mapNodeKind(n.file_type, label),
      name: label,
      filePath: n.source_file,
      startLine: parseLine(n.source_location),
      docComment: typeof n.summary === "string" ? n.summary : undefined,
    };
  }

  const edges: CodeGraphEdge[] = [];
  for (const e of edgesArr) {
    if (!e.source || !e.target) continue;
    if (!nodes[e.source]) {
      nodes[e.source] = { id: e.source, kind: "variable", name: e.source };
    }
    if (!nodes[e.target]) {
      nodes[e.target] = { id: e.target, kind: "variable", name: e.target };
    }
    edges.push({
      from: e.source,
      to: e.target,
      kind: mapEdgeKind(e.relation),
      confidence: mapConfidence(e.confidence),
    });
  }

  const builtAt = new Date().toISOString();
  return {
    graphId: options.graphId,
    rootPath: options.rootPath ?? "",
    builtAt,
    nodeCount: Object.keys(nodes).length,
    edgeCount: edges.length,
    nodes,
    edges,
    adjacency: buildAdjacencyFromEdges(edges),
  };
}
