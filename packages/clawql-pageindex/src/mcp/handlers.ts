import { z } from "zod";

import { DefaultPageIndexBuilder } from "../builder.js";
import { FilePageIndexStorage, defaultPageIndexStoragePath } from "../storage/file-storage.js";
import { DefaultPageIndexTraversal } from "../traversal.js";
import type { PageIndexDocument } from "../types.js";

const buildInput = z.object({
  docId: z.string().min(1),
  markdown: z.string(),
  storagePath: z.string().optional(),
});

const traverseInput = z.object({
  docId: z.string().min(1),
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
  storagePath: z.string().optional(),
});

const synthesizeInput = z.object({
  docId: z.string().min(1),
  query: z.string().min(1),
  tokenBudget: z.number().int().positive().optional(),
  storagePath: z.string().optional(),
});

const getContentInput = z.object({
  docId: z.string().min(1),
  nodeId: z.string().min(1),
  storagePath: z.string().optional(),
});

function storageFromPath(storagePath?: string): FilePageIndexStorage {
  const base = process.env.CLAWQL_PAGEINDEX_PATH?.trim();
  const path = storagePath ?? (base ? defaultPageIndexStoragePath(base) : "./data/pageindex.db.json");
  return new FilePageIndexStorage(path);
}

export async function pageindexBuildTree(raw: unknown): Promise<{
  docId: string;
  nodeCount: number;
  builtAt: string;
}> {
  const input = buildInput.parse(raw);
  const builder = new DefaultPageIndexBuilder();
  const doc = builder.buildFromMarkdown(input.docId, input.markdown);
  await storageFromPath(input.storagePath).put(doc);
  return { docId: doc.docId, nodeCount: Object.keys(doc.nodes).length, builtAt: doc.builtAt };
}

export async function pageindexTraverse(raw: unknown) {
  const input = traverseInput.parse(raw);
  const store = storageFromPath(input.storagePath);
  const doc = await store.get(input.docId);
  if (!doc) throw new Error(`PageIndex document not found: ${input.docId}`);
  const traversal = new DefaultPageIndexTraversal();
  return traversal.traverse(doc, input.query, input.limit);
}

export async function pageindexSynthesize(raw: unknown) {
  const input = synthesizeInput.parse(raw);
  const store = storageFromPath(input.storagePath);
  const doc = await store.get(input.docId);
  if (!doc) throw new Error(`PageIndex document not found: ${input.docId}`);
  const traversal = new DefaultPageIndexTraversal();
  return traversal.synthesize(doc, input.query, { tokenBudget: input.tokenBudget });
}

export async function pageindexGetContent(raw: unknown) {
  const input = getContentInput.parse(raw);
  const store = storageFromPath(input.storagePath);
  const doc = await store.get(input.docId);
  if (!doc) throw new Error(`PageIndex document not found: ${input.docId}`);
  const node = doc.nodes[input.nodeId];
  if (!node) throw new Error(`PageIndex node not found: ${input.nodeId}`);
  return { nodeId: node.id, title: node.title, content: node.content };
}

export type PageIndexMcpHandlers = {
  buildTree: typeof pageindexBuildTree;
  traverse: typeof pageindexTraverse;
  synthesize: typeof pageindexSynthesize;
  getContent: typeof pageindexGetContent;
};

export function createPageIndexMcpHandlers(): PageIndexMcpHandlers {
  return {
    buildTree: pageindexBuildTree,
    traverse: pageindexTraverse,
    synthesize: pageindexSynthesize,
    getContent: pageindexGetContent,
  };
}

export type { PageIndexDocument };
