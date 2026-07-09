import type { PageIndexDocument, PageIndexTraversalHit, SynthesizeResult } from "./types.js";

function scoreNode(query: string, title: string, content: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const terms = q.split(/\s+/).filter(Boolean);
  let score = 0;
  const titleL = title.toLowerCase();
  const contentL = content.toLowerCase();
  for (const t of terms) {
    if (titleL.includes(t)) score += 3;
    if (contentL.includes(t)) score += 1;
  }
  return score;
}

export function traversePageIndex(
  doc: PageIndexDocument,
  query: string,
  limit = 8
): PageIndexTraversalHit[] {
  const hits: PageIndexTraversalHit[] = [];
  for (const node of Object.values(doc.nodes)) {
    const score = scoreNode(query, node.title, node.content);
    if (score <= 0) continue;
    const snippet = node.content.trim().slice(0, 240);
    hits.push({
      nodeId: node.id,
      title: node.title,
      score,
      snippet,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/**
 * Concatenate top-scoring sections up to a token budget (Phase 1 synthesize).
 */
export function synthesizePageIndex(
  doc: PageIndexDocument,
  query: string,
  options: { tokenBudget?: number } = {}
): SynthesizeResult {
  const budget = options.tokenBudget ?? 1500;
  const hits = traversePageIndex(doc, query, 32);
  const parts: string[] = [];
  const nodeIds: string[] = [];
  let tokensUsed = 0;

  for (const hit of hits) {
    const node = doc.nodes[hit.nodeId];
    if (!node) continue;
    const block = `## ${node.title}\n\n${node.content.trim()}`;
    const est = node.tokenEstimate || Math.ceil(block.length / 4);
    if (tokensUsed + est > budget && parts.length > 0) break;
    parts.push(block);
    nodeIds.push(node.id);
    tokensUsed += est;
    if (tokensUsed >= budget) break;
  }

  return {
    text: parts.join("\n\n"),
    nodeIds,
    tokensUsed,
  };
}

export interface PageIndexTraversal {
  traverse(doc: PageIndexDocument, query: string, limit?: number): PageIndexTraversalHit[];
  synthesize(
    doc: PageIndexDocument,
    query: string,
    options?: { tokenBudget?: number }
  ): SynthesizeResult;
}

export class DefaultPageIndexTraversal implements PageIndexTraversal {
  traverse(doc: PageIndexDocument, query: string, limit?: number) {
    return traversePageIndex(doc, query, limit);
  }
  synthesize(doc: PageIndexDocument, query: string, options?: { tokenBudget?: number }) {
    return synthesizePageIndex(doc, query, options);
  }
}
