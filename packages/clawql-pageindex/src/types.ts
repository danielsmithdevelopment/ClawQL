export type PageIndexNode = {
  id: string;
  parentId: string | null;
  title: string;
  /** Markdown heading level (1–6) or 0 for preamble. */
  level: number;
  content: string;
  tokenEstimate: number;
};

export type PageIndexDocument = {
  docId: string;
  rootId: string;
  nodes: Record<string, PageIndexNode>;
  builtAt: string;
};

export type PageIndexTraversalHit = {
  nodeId: string;
  title: string;
  score: number;
  snippet: string;
};

export type SynthesizeResult = {
  text: string;
  nodeIds: string[];
  tokensUsed: number;
};
