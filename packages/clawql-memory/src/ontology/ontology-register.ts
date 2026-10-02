/**
 * Public APIs to register Layer 2/3 dynamic entities into vault ontology.db.
 */
import { Effect } from "effect";
import { MemoryError } from "../effect/memory-errors.js";
import { memoryFromPromise } from "../effect/memory-effect-utils.js";
import {
  openOntologyDb,
  ontologyDbEnabled,
  ontologyDbExplicitlyDisabled,
  withOntologyWriteLock,
} from "./ontology-db.js";
import {
  upsertDynamicEntity,
  upsertDynamicRecord,
  type DynamicEntityDef,
} from "./ontology-dynamic.js";

export type RegisterDynamicOntologyResult =
  { ok: true; entityId: string; path: string } | { ok: false; error: string };

export type UpsertDynamicOntologyRecordResult =
  { ok: true; entityId: string; recordId: string } | { ok: false; error: string };

/** Persist a scaffolded entity definition into ontology.db (Layer 2/3). */
export function registerDynamicOntologyEntityEffect(
  vaultRoot: string,
  entity: DynamicEntityDef
): Effect.Effect<RegisterDynamicOntologyResult, MemoryError> {
  return memoryFromPromise(async () => {
    if (ontologyDbExplicitlyDisabled()) {
      return { ok: false, error: "CLAWQL_ONTOLOGY_DB=0" };
    }
    if (!ontologyDbEnabled()) {
      return {
        ok: false,
        error: "ontology.db disabled or vault not configured (set CLAWQL_OBSIDIAN_VAULT_PATH)",
      };
    }
    return withOntologyWriteLock(vaultRoot, async () => {
      const handle = await openOntologyDb(vaultRoot);
      if (!handle) return { ok: false, error: "Could not open ontology.db" };
      try {
        upsertDynamicEntity(handle.db, entity);
        await handle.persist();
        return { ok: true, entityId: entity.id, path: handle.path };
      } finally {
        handle.close();
      }
    });
  });
}

/** Promise façade. */
export async function registerDynamicOntologyEntity(
  vaultRoot: string,
  entity: DynamicEntityDef
): Promise<RegisterDynamicOntologyResult> {
  return Effect.runPromise(registerDynamicOntologyEntityEffect(vaultRoot, entity));
}

/** Upsert one instance record for a dynamic entity. */
export function upsertDynamicOntologyRecordEffect(
  vaultRoot: string,
  entityId: string,
  recordId: string,
  fields: Record<string, unknown>,
  vaultNotePath?: string
): Effect.Effect<UpsertDynamicOntologyRecordResult, MemoryError> {
  return memoryFromPromise(async () => {
    if (ontologyDbExplicitlyDisabled()) {
      return { ok: false, error: "CLAWQL_ONTOLOGY_DB=0" };
    }
    if (!ontologyDbEnabled()) {
      return {
        ok: false,
        error: "ontology.db disabled or vault not configured (set CLAWQL_OBSIDIAN_VAULT_PATH)",
      };
    }
    return withOntologyWriteLock(vaultRoot, async () => {
      const handle = await openOntologyDb(vaultRoot);
      if (!handle) return { ok: false, error: "Could not open ontology.db" };
      try {
        upsertDynamicRecord(handle.db, entityId, recordId, fields, vaultNotePath);
        await handle.persist();
        return { ok: true, entityId, recordId };
      } finally {
        handle.close();
      }
    });
  });
}

/** Promise façade. */
export async function upsertDynamicOntologyRecord(
  vaultRoot: string,
  entityId: string,
  recordId: string,
  fields: Record<string, unknown>,
  vaultNotePath?: string
): Promise<UpsertDynamicOntologyRecordResult> {
  return Effect.runPromise(
    upsertDynamicOntologyRecordEffect(vaultRoot, entityId, recordId, fields, vaultNotePath)
  );
}

/** Register entity + upsert a primary document record (and optional nested row maps). */
export function syncDynamicOntologyDocumentEffect(
  vaultRoot: string,
  entity: DynamicEntityDef,
  documentId: string,
  record: Record<string, unknown>,
  nested?: Array<{ entityId: string; recordId: string; fields: Record<string, unknown> }>
): Effect.Effect<RegisterDynamicOntologyResult, MemoryError> {
  return memoryFromPromise(async () => {
    if (ontologyDbExplicitlyDisabled()) {
      return { ok: false, error: "CLAWQL_ONTOLOGY_DB=0" };
    }
    if (!ontologyDbEnabled()) {
      return {
        ok: false,
        error: "ontology.db disabled or vault not configured (set CLAWQL_OBSIDIAN_VAULT_PATH)",
      };
    }
    return withOntologyWriteLock(vaultRoot, async () => {
      const handle = await openOntologyDb(vaultRoot);
      if (!handle) return { ok: false, error: "Could not open ontology.db" };
      try {
        upsertDynamicEntity(handle.db, entity);
        for (const rel of entity.relationships ?? []) {
          const probe = handle.db.prepare(
            `SELECT 1 AS ok FROM dynamic_entities WHERE id = ? LIMIT 1`
          );
          probe.bind([rel.targetEntity]);
          const exists = probe.step();
          probe.free();
          if (!exists) {
            upsertDynamicEntity(handle.db, {
              id: rel.targetEntity,
              source: entity.source,
              fields: [],
              relationships: [],
              documentType: entity.documentType,
            });
          }
        }
        upsertDynamicRecord(handle.db, entity.id, documentId, record);
        for (const row of nested ?? []) {
          upsertDynamicRecord(handle.db, row.entityId, row.recordId, row.fields);
        }
        await handle.persist();
        return { ok: true, entityId: entity.id, path: handle.path };
      } finally {
        handle.close();
      }
    });
  });
}

/** Promise façade. */
export async function syncDynamicOntologyDocument(
  vaultRoot: string,
  entity: DynamicEntityDef,
  documentId: string,
  record: Record<string, unknown>,
  nested?: Array<{ entityId: string; recordId: string; fields: Record<string, unknown> }>
): Promise<RegisterDynamicOntologyResult> {
  return Effect.runPromise(
    syncDynamicOntologyDocumentEffect(vaultRoot, entity, documentId, record, nested)
  );
}
