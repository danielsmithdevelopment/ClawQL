/**
 * Populate ontology.db from vault Markdown CLAWQL_* blocks (ingest + lazy sync).
 */

import { listVaultMarkdownRelPaths } from "../vault/slug-index.js";
import { readVaultTextFile } from "../vault/utils.js";
import { extractMatterFromClawqlFields } from "./clawql-fields.js";
import {
  openOntologyDb,
  ontologyDbEnabled,
  upsertMatter,
  type OntologyDbHandle,
} from "./ontology-db.js";

function defaultScanRoot(): string {
  const v = process.env.CLAWQL_MEMORY_RECALL_SCAN_ROOT;
  if (v === undefined) return "Memory";
  const t = v.trim();
  return t === "" ? "" : t;
}

/** Upsert a single vault note into ontology.db when it contains CLAWQL_MATTER_ID. */
export async function upsertOntologyFromVaultNote(
  vault: string,
  relPath: string,
  markdown: string
): Promise<{ upserted: boolean; matterId?: string }> {
  if (!ontologyDbEnabled()) return { upserted: false };
  const extracted = extractMatterFromClawqlFields(markdown);
  if (!extracted) return { upserted: false };
  const handle = await openOntologyDb(vault);
  if (!handle) return { upserted: false };
  try {
    upsertMatter(handle.db, extracted, relPath, extracted.fields.title);
    await handle.persist();
    return { upserted: true, matterId: extracted.fields.id };
  } finally {
    handle.close();
  }
}

/** Scan vault Markdown and upsert all machine-readable Matter blocks. */
export async function syncOntologyMattersFromVault(
  vault: string,
  existing?: OntologyDbHandle
): Promise<{ scanned: number; upserted: number }> {
  if (!ontologyDbEnabled()) return { scanned: 0, upserted: 0 };
  const handle = existing ?? (await openOntologyDb(vault));
  if (!handle) return { scanned: 0, upserted: 0 };

  const ownsHandle = !existing;
  try {
    const maxFiles = Number.parseInt(process.env.CLAWQL_MEMORY_RECALL_MAX_FILES ?? "2000", 10);
    const paths = await listVaultMarkdownRelPaths(
      vault,
      defaultScanRoot(),
      Number.isFinite(maxFiles) ? maxFiles : 2000
    );
    let upserted = 0;
    for (const rel of paths) {
      let text = "";
      try {
        text = await readVaultTextFile(vault, rel);
      } catch {
        continue;
      }
      const extracted = extractMatterFromClawqlFields(text);
      if (!extracted) continue;
      upsertMatter(handle.db, extracted, rel, extracted.fields.title);
      upserted += 1;
    }
    await handle.persist();
    return { scanned: paths.length, upserted };
  } finally {
    if (ownsHandle) handle.close();
  }
}
