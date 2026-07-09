import { getObsidianVaultPath } from "../vault/config.js";
import { readVaultTextFile } from "../vault/utils.js";
import {
  DefaultPageIndexBuilder,
  DefaultPageIndexTraversal,
  FilePageIndexStorage,
  defaultPageIndexStoragePath,
} from "clawql-pageindex";

export function pageIndexEnabled(): boolean {
  return process.env.CLAWQL_ENABLE_PAGEINDEX?.trim() !== "0";
}

function storage(): FilePageIndexStorage {
  const vault = getObsidianVaultPath();
  if (!vault) throw new Error("CLAWQL_OBSIDIAN_VAULT_PATH is not set");
  return new FilePageIndexStorage(defaultPageIndexStoragePath(vault));
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
