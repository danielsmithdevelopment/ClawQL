/**
 * Populate ontology.db from vault Markdown CLAWQL_* blocks (ingest + lazy sync).
 */

import { listVaultMarkdownRelPaths } from "../vault/slug-index.js";
import { readVaultTextFile } from "../vault/utils.js";
import {
  extractAttorneyFromClawqlFields,
  extractClientFromClawqlFields,
  extractDocumentFromClawqlFields,
  extractMatterFromClawqlFields,
} from "./clawql-fields.js";
import {
  countLegalEntities,
  openOntologyDb,
  ontologyDbEnabled,
  upsertAttorney,
  upsertClient,
  upsertDocument,
  upsertMatter,
  withOntologyWriteLock,
  type OntologyDbHandle,
} from "./ontology-db.js";

type LegalEntitySchema = "legal.Matter" | "legal.Client" | "legal.Attorney" | "legal.Document";

function defaultScanRoot(): string {
  const v = process.env.CLAWQL_MEMORY_RECALL_SCAN_ROOT;
  if (v === undefined) return "Memory";
  const t = v.trim();
  return t === "" ? "" : t;
}

function upsertLegalEntityFromMarkdown(
  handle: OntologyDbHandle,
  relPath: string,
  markdown: string
): boolean {
  const document = extractDocumentFromClawqlFields(markdown);
  if (document) {
    upsertDocument(handle.db, document, relPath);
    return true;
  }
  const attorney = extractAttorneyFromClawqlFields(markdown);
  if (attorney) {
    upsertAttorney(handle.db, attorney, relPath);
    return true;
  }
  const client = extractClientFromClawqlFields(markdown);
  if (client) {
    upsertClient(handle.db, client, relPath);
    return true;
  }
  const matter = extractMatterFromClawqlFields(markdown);
  if (matter) {
    upsertMatter(handle.db, matter, relPath, matter.fields.title);
    return true;
  }
  return false;
}

/** Upsert a single vault note into ontology.db when it contains a legal CLAWQL_* block. */
export async function upsertOntologyFromVaultNote(
  vault: string,
  relPath: string,
  markdown: string
): Promise<{ upserted: boolean; matterId?: string; clientId?: string }> {
  if (!ontologyDbEnabled()) return { upserted: false };
  const matter = extractMatterFromClawqlFields(markdown);
  if (
    !matter &&
    !extractClientFromClawqlFields(markdown) &&
    !extractAttorneyFromClawqlFields(markdown) &&
    !extractDocumentFromClawqlFields(markdown)
  ) {
    return { upserted: false };
  }
  return withOntologyWriteLock(vault, async () => {
    const handle = await openOntologyDb(vault);
    if (!handle) return { upserted: false };
    try {
      const upserted = upsertLegalEntityFromMarkdown(handle, relPath, markdown);
      if (!upserted) return { upserted: false };
      await handle.persist();
      const client = extractClientFromClawqlFields(markdown);
      return {
        upserted: true,
        matterId: matter?.fields.id,
        clientId: client?.fields.id,
      };
    } finally {
      handle.close();
    }
  });
}

/** Scan vault Markdown and upsert all machine-readable legal entity blocks. */
export async function syncOntologyLegalEntitiesFromVault(
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
      if (upsertLegalEntityFromMarkdown(handle, rel, text)) upserted += 1;
    }
    await handle.persist();
    return { scanned: paths.length, upserted };
  } finally {
    if (ownsHandle) handle.close();
  }
}

/** @deprecated Use {@link syncOntologyLegalEntitiesFromVault}. */
export async function syncOntologyMattersFromVault(
  vault: string,
  existing?: OntologyDbHandle
): Promise<{ scanned: number; upserted: number }> {
  return syncOntologyLegalEntitiesFromVault(vault, existing);
}

/** Lazy-sync vault CLAWQL blocks when the target legal entity table is empty. */
export async function ensureOntologyLegalEntitiesIndexed(
  vault: string,
  schema: LegalEntitySchema
): Promise<void> {
  {
    const probe = await openOntologyDb(vault);
    if (!probe) return;
    try {
      if (countLegalEntities(probe.db, schema) > 0) return;
    } finally {
      probe.close();
    }
  }

  await withOntologyWriteLock(vault, async () => {
    const handle = await openOntologyDb(vault);
    if (!handle) return;
    try {
      if (countLegalEntities(handle.db, schema) > 0) return;
      await syncOntologyLegalEntitiesFromVault(vault, handle);
    } finally {
      handle.close();
    }
  });
}

/** @deprecated Use {@link ensureOntologyLegalEntitiesIndexed} with `legal.Matter`. */
export async function ensureOntologyMattersIndexed(vault: string): Promise<void> {
  return ensureOntologyLegalEntitiesIndexed(vault, "legal.Matter");
}
