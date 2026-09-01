/**
 * Sync Layer 2/3 CQE entities into clawql-memory ontology.db for memory_recall.
 * Ontology → memory dependency (acyclic).
 */
import { Effect } from "effect";
import {
  registerDynamicOntologyEntity,
  syncDynamicOntologyDocument,
  type DynamicEntityDef,
} from "clawql-memory/ontology";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { OntologyError, ontologyFail, ontologyFromPromise } from "../effect/ontology-errors.js";
import type { CQEEntity } from "../shared/cqe-runtime-types.js";

function toDynamicEntityDef(entity: CQEEntity): DynamicEntityDef {
  return {
    id: entity.id,
    source: entity.source,
    fields: entity.fields.map((f) => ({
      name: f.name,
      type: f.type,
      nullable: f.nullable,
      description: f.description,
    })),
    relationships: entity.relationships.map((r) => ({
      name: r.name,
      type: r.type,
      targetEntity: r.targetEntity,
      description: r.description,
    })),
    documentType: entity.documentType,
    sourceHash: entity.sourceHash,
  };
}

function resolveVault(explicit?: string): Effect.Effect<string, OntologyError> {
  return Effect.gen(function* () {
    const vault = explicit?.trim() || getObsidianVaultPath();
    if (!vault) {
      return yield* ontologyFail(
        "No vault configured (pass vaultRoot or set CLAWQL_OBSIDIAN_VAULT_PATH)"
      );
    }
    return vault;
  });
}

/** Register a scaffolded entity definition into ontology.db. */
export function syncEntityToMemoryOntology(
  entity: CQEEntity,
  options: { vaultRoot?: string } = {}
): Effect.Effect<{ entityId: string; path: string }, OntologyError> {
  return Effect.gen(function* () {
    const vault = yield* resolveVault(options.vaultRoot);
    const result = yield* ontologyFromPromise(() =>
      registerDynamicOntologyEntity(vault, toDynamicEntityDef(entity))
    );
    if (!result.ok) return yield* ontologyFail(result.error);
    return { entityId: result.entityId, path: result.path };
  });
}

/** Register entity + upsert document record (+ nested rows) into ontology.db. */
export function syncDocumentToMemoryOntology(
  entity: CQEEntity,
  documentId: string,
  record: Record<string, unknown>,
  options: {
    vaultRoot?: string;
    nested?: Array<{ entityId: string; recordId: string; fields: Record<string, unknown> }>;
  } = {}
): Effect.Effect<{ entityId: string; path: string }, OntologyError> {
  return Effect.gen(function* () {
    const vault = yield* resolveVault(options.vaultRoot);
    const result = yield* ontologyFromPromise(() =>
      syncDynamicOntologyDocument(
        vault,
        toDynamicEntityDef(entity),
        documentId,
        record,
        options.nested
      )
    );
    if (!result.ok) return yield* ontologyFail(result.error);
    return { entityId: result.entityId, path: result.path };
  });
}

export { toDynamicEntityDef };
