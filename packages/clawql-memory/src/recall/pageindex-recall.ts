import { getObsidianVaultPath } from "../vault/config.js";
import { readVaultTextFile } from "../vault/utils.js";
import {
  DefaultPageIndexBuilder,
  DefaultPageIndexTraversal,
  FilePageIndexStorage,
  defaultPageIndexStoragePath,
  traversePageIndex,
} from "clawql-pageindex";
import type { NormalizedRecallHit, RecallFollowUpHint } from "./recall-sources.js";
import { pageIndexEnabled } from "./pageindex-enabled.js";

export { pageIndexEnabled } from "./pageindex-enabled.js";

/** Resolve PageIndex JSON path consistently with MCP handlers when CLAWQL_PAGEINDEX_PATH is set. */
export function resolvePageIndexStorageFilePath(): string {
  const base = process.env.CLAWQL_PAGEINDEX_PATH?.trim();
  if (base) return defaultPageIndexStoragePath(base);
  const vault = getObsidianVaultPath();
  if (vault) return defaultPageIndexStoragePath(vault);
  return "./data/pageindex.db.json";
}

function storage(): FilePageIndexStorage {
  return new FilePageIndexStorage(resolvePageIndexStorageFilePath());
}

export async function pageindexBuildFromVaultPath(input: {
  docId: string;
  vaultRelativePath: string;
}): Promise<{ docId: string; nodeCount: number }> {
  const vault = getObsidianVaultPath();
  if (!vault) throw new Error("CLAWQL_OBSIDIAN_VAULT_PATH is not set");
  const markdown = await readVaultTextFile(vault, input.vaultRelativePath);
  const builder = new DefaultPageIndexBuilder();
  const doc = builder.buildFromMarkdown(input.docId, markdown);
  await storage().put(doc);
  return { docId: doc.docId, nodeCount: Object.keys(doc.nodes).length };
}

export async function pageindexSynthesizeForQuery(input: {
  docId: string;
  query: string;
  tokenBudget?: number;
}) {
  const doc = await storage().get(input.docId);
  if (!doc) throw new Error(`PageIndex document not found: ${input.docId}`);
  const traversal = new DefaultPageIndexTraversal();
  return traversal.synthesize(doc, input.query, { tokenBudget: input.tokenBudget });
}

export type PageIndexRecallSupplement = {
  hits: NormalizedRecallHit[];
  followUps: RecallFollowUpHint[];
  skipped?: string;
};

/** Term-overlap traverse across stored PageIndex docs (vectorless). */
export async function recallPageIndexSupplement(input: {
  query: string;
  limit?: number;
}): Promise<PageIndexRecallSupplement> {
  if (!pageIndexEnabled()) {
    return {
      hits: [],
      followUps: [
        {
          tool: "pageindex_build_tree",
          reason: "PageIndex tools are disabled (CLAWQL_ENABLE_PAGEINDEX=0).",
        },
      ],
      skipped: "PageIndex disabled",
    };
  }

  const limit = input.limit ?? envInt("CLAWQL_MEMORY_RECALL_PAGEINDEX_LIMIT", 8);
  const store = storage();
  let docIds: string[];
  try {
    docIds = await store.list();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      hits: [],
      followUps: [
        {
          tool: "pageindex_build_tree",
          reason: "Build a PageIndex tree before hybrid recall can use pageindex source.",
        },
      ],
      skipped: msg,
    };
  }

  if (docIds.length === 0) {
    return {
      hits: [],
      followUps: [
        {
          tool: "pageindex_build_tree",
          reason: "No PageIndex trees stored yet; build from vault Markdown first.",
        },
      ],
      skipped: "No PageIndex documents in storage",
    };
  }

  const hits: NormalizedRecallHit[] = [];
  const followUps: RecallFollowUpHint[] = [];
  for (const docId of docIds) {
    const doc = await store.get(docId);
    if (!doc) continue;
    const traversed = traversePageIndex(doc, input.query, limit);
    for (const h of traversed) {
      hits.push({
        source: "pageindex",
        id: `${docId}:${h.nodeId}`,
        score: h.score,
        snippet: h.snippet,
        title: h.title,
        meta: { docId, nodeId: h.nodeId },
      });
    }
    if (traversed.length > 0) {
      followUps.push({
        tool: "pageindex_synthesize",
        reason: `Synthesize top PageIndex nodes under a token budget for doc ${docId}.`,
        args: { docId, query: input.query },
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return {
    hits: hits.slice(0, limit),
    followUps: followUps.slice(0, 3),
  };
}

function envInt(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
