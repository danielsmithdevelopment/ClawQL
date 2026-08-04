/** How an edge was derived — aligned with Graphify confidence labels. */
export type CodeGraphEdgeKind =
  | "imports"
  | "exports"
  | "contains"
  | "calls"
  | "extends"
  | "implements"
  | "references";

export type CodeGraphEdgeConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export type CodeGraphNodeKind =
  | "file"
  | "module"
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "variable";

export type CodeGraphNode = {
  readonly id: string;
  readonly kind: CodeGraphNodeKind;
  readonly name: string;
  readonly filePath?: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly signature?: string;
  readonly docComment?: string;
  /** Optional Leiden / Graphify community id when imported from graph.json. */
  readonly community?: number | string;
};

export type CodeGraphEdge = {
  readonly from: string;
  readonly to: string;
  readonly kind: CodeGraphEdgeKind;
  readonly confidence: CodeGraphEdgeConfidence;
};

export type CodeGraphDocument = {
  readonly graphId: string;
  readonly rootPath: string;
  readonly builtAt: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodes: Record<string, CodeGraphNode>;
  readonly edges: CodeGraphEdge[];
  readonly adjacency: Record<string, string[]>;
};

export type CodeGraphQueryHit = {
  readonly nodeId: string;
  readonly name: string;
  readonly kind: CodeGraphNodeKind;
  readonly filePath?: string;
  readonly score: number;
  readonly snippet?: string;
};

export type CodeGraphNeighbor = {
  readonly nodeId: string;
  readonly name: string;
  readonly kind: CodeGraphNodeKind;
  readonly edgeKind: CodeGraphEdgeKind;
  readonly confidence: CodeGraphEdgeConfidence;
  readonly direction: "out" | "in";
};

export type CodeGraphPathResult = {
  readonly found: boolean;
  readonly from: string;
  readonly to: string;
  readonly path: string[];
  readonly hops: number;
};

export type CodeGraphExplainResult = {
  readonly nodeId: string;
  readonly node: CodeGraphNode;
  readonly inbound: CodeGraphNeighbor[];
  readonly outbound: CodeGraphNeighbor[];
  readonly summary: string;
};
