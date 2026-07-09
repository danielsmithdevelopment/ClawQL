import type { PageIndexDocument, PageIndexNode } from "./types.js";

function trimDashes(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === "-") start += 1;
  while (end > start && s[end - 1] === "-") end -= 1;
  return s.slice(start, end);
}

function slugPart(text: string): string {
  const trimmed = text.trim().toLowerCase().slice(0, 64);
  let s = "";
  for (const ch of trimmed) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) s += ch;
    else if (ch === "-" || ch === "_" || ch === " ") s += "-";
  }
  return trimDashes(s).slice(0, 48);
}

function estimateTokens(text: string): number {
  let words = 0;
  let inWord = false;
  for (const ch of text.trim()) {
    if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") {
      inWord = false;
    } else if (!inWord) {
      words += 1;
      inWord = true;
    }
  }
  return Math.max(1, Math.ceil(words * 1.3));
}

function parseHeading(line: string): { level: number; title: string } | null {
  if (!line.startsWith("#")) return null;
  let level = 0;
  while (level < line.length && line[level] === "#") level += 1;
  if (level < 1 || level > 6) return null;
  if (line[level] !== " ") return null;
  const title = line.slice(level + 1).trim();
  if (!title) return null;
  return { level, title };
}

function nodeId(docId: string, title: string, index: number): string {
  const base = slugPart(title) || `section-${index}`;
  return `${docId}:${base}`;
}

/**
 * Build a hierarchical index from Markdown headings (# … ######).
 */
export function buildPageIndexFromMarkdown(docId: string, markdown: string): PageIndexDocument {
  const lines = markdown.split("\n");
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

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const heading = parseHeading(line);
    if (heading) {
      flush();
      const { level, title } = heading;
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
