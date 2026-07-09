import type { PageIndexDocument, PageIndexNode } from "./types.js";

function slugPart(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.3));
}

function nodeId(docId: string, title: string, index: number): string {
  const base = slugPart(title) || `section-${index}`;
  return `${docId}:${base}`;
}

/**
 * Build a hierarchical index from Markdown headings (# … ######).
 */
export function buildPageIndexFromMarkdown(docId: string, markdown: string): PageIndexDocument {
  const lines = markdown.split(/\r?\n/);
  const nodes: Record<string, PageIndexNode> = {};
  const stack: Array<{ id: string; level: number }> = [];
  let current: PageIndexNode | null = null;
  let sectionIndex = 0;
  const rootId = `${docId}:root`;

  const flush = () => {
    if (!current) return;
    current.tokenEstimate = estimateTokens(current.content);
    nodes[current.id] = current;
    current = null;
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) {
      flush();
      const level = m[1]!.length;
      const title = m[2]!.trim();
      sectionIndex += 1;
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
        stack.pop();
      }
      const parentId = stack.length > 0 ? stack[stack.length - 1]!.id : rootId;
      const id = nodeId(docId, title, sectionIndex);
      current = {
        id,
        parentId,
        title,
        level,
        content: "",
        tokenEstimate: 0,
      };
      stack.push({ id, level });
      continue;
    }
    if (!current) {
      if (!nodes[rootId]) {
        nodes[rootId] = {
          id: rootId,
          parentId: null,
          title: "(document)",
          level: 0,
          content: "",
          tokenEstimate: 0,
        };
        current = nodes[rootId]!;
      } else {
        current = nodes[rootId]!;
      }
    }
    current.content += `${line}\n`;
  }
  flush();

  if (!nodes[rootId]) {
    nodes[rootId] = {
      id: rootId,
      parentId: null,
      title: "(document)",
      level: 0,
      content: markdown,
      tokenEstimate: estimateTokens(markdown),
    };
  }

  return {
    docId,
    rootId,
    nodes,
    builtAt: new Date().toISOString(),
  };
}

export interface PageIndexBuilder {
  buildFromMarkdown(docId: string, markdown: string): PageIndexDocument;
}

export class DefaultPageIndexBuilder implements PageIndexBuilder {
  buildFromMarkdown(docId: string, markdown: string): PageIndexDocument {
    return buildPageIndexFromMarkdown(docId, markdown);
  }
}
