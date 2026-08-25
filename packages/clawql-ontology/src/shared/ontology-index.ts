/**
 * Unified dynamic CQE entity index (Layer 2 session/permanent + Layer 3 merges).
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md §4
 */
import { Context, Effect, Layer } from "effect";
import type {
  CQEEntity,
  RegisterDynamicOptions,
  ScaffoldTtl,
} from "../shared/cqe-runtime-types.js";
import { OntologyError, ontologyFail, ontologySync } from "../effect/ontology-errors.js";

export type DynamicRecord = Record<string, unknown> & { id: string };

export type IndexedEntity = {
  entity: CQEEntity;
  ttl: ScaffoldTtl;
  registeredAt: string;
  expiresAt: number | null;
};

type IndexState = {
  entities: Map<string, IndexedEntity>;
  records: Map<string, Map<string, DynamicRecord>>;
};

function createState(): IndexState {
  return { entities: new Map(), records: new Map() };
}

function resolveExpiry(ttl: ScaffoldTtl, now: number): number | null {
  if (ttl === "permanent") return null;
  if (ttl === "session") return null; // cleared explicitly via clearSession
  if (typeof ttl === "number") return now + ttl * 1000;
  return null;
}

function isExpired(entry: IndexedEntity, now: number): boolean {
  return entry.expiresAt !== null && entry.expiresAt <= now;
}

export class OntologyIndexService extends Context.Tag("clawql/OntologyIndexService")<
  OntologyIndexService,
  {
    readonly registerDynamic: (
      entity: CQEEntity,
      options?: RegisterDynamicOptions
    ) => Effect.Effect<CQEEntity, OntologyError>;
    readonly getEntity: (entityId: string) => Effect.Effect<CQEEntity | null>;
    readonly listEntities: () => Effect.Effect<CQEEntity[]>;
    readonly upsert: (
      entityId: string,
      recordId: string,
      record: Record<string, unknown>
    ) => Effect.Effect<DynamicRecord, OntologyError>;
    readonly getRecord: (
      entityId: string,
      recordId: string
    ) => Effect.Effect<DynamicRecord | null>;
    readonly listRecords: (entityId: string) => Effect.Effect<DynamicRecord[]>;
    readonly clearSession: () => Effect.Effect<void>;
    readonly resetForTests: () => Effect.Effect<void>;
  }
>() {}

export function makeOntologyIndexLive(): Layer.Layer<OntologyIndexService> {
  const state = createState();

  return Layer.succeed(
    OntologyIndexService,
    OntologyIndexService.of({
      registerDynamic: (entity, options = {}) =>
        Effect.gen(function* () {
          const now = Date.now();
          const existing = state.entities.get(entity.id);
          if (existing && !options.overwrite && !isExpired(existing, now)) {
            return yield* ontologyFail(
              `Entity already registered: ${entity.id} (pass overwrite: true)`
            );
          }
          const ttl = options.ttl ?? "session";
          const entry: IndexedEntity = {
            entity,
            ttl,
            registeredAt: new Date(now).toISOString(),
            expiresAt: resolveExpiry(ttl, now),
          };
          state.entities.set(entity.id, entry);
          if (!state.records.has(entity.id)) {
            state.records.set(entity.id, new Map());
          }
          return entity;
        }),

      getEntity: (entityId) =>
        ontologySync(() => {
          const entry = state.entities.get(entityId);
          if (!entry) return null;
          if (isExpired(entry, Date.now())) {
            state.entities.delete(entityId);
            state.records.delete(entityId);
            return null;
          }
          return entry.entity;
        }),

      listEntities: () =>
        ontologySync(() => {
          const now = Date.now();
          const out: CQEEntity[] = [];
          for (const [id, entry] of state.entities) {
            if (isExpired(entry, now)) {
              state.entities.delete(id);
              state.records.delete(id);
              continue;
            }
            out.push(entry.entity);
          }
          return out;
        }),

      upsert: (entityId, recordId, record) =>
        Effect.gen(function* () {
          const entry = state.entities.get(entityId);
          if (!entry || isExpired(entry, Date.now())) {
            return yield* ontologyFail(`Unknown or expired entity: ${entityId}`);
          }
          let bucket = state.records.get(entityId);
          if (!bucket) {
            bucket = new Map();
            state.records.set(entityId, bucket);
          }
          const row: DynamicRecord = { ...record, id: recordId };
          bucket.set(recordId, row);
          return row;
        }),

      getRecord: (entityId, recordId) =>
        ontologySync(() => state.records.get(entityId)?.get(recordId) ?? null),

      listRecords: (entityId) =>
        ontologySync(() => [...(state.records.get(entityId)?.values() ?? [])]),

      clearSession: () =>
        ontologySync(() => {
          for (const [id, entry] of state.entities) {
            if (entry.ttl === "session") {
              state.entities.delete(id);
              state.records.delete(id);
            }
          }
        }),

      resetForTests: () =>
        ontologySync(() => {
          state.entities.clear();
          state.records.clear();
        }),
    })
  );
}

/** Default in-process index layer. */
export const OntologyIndexLive = makeOntologyIndexLive();

/** Run an Effect requiring OntologyIndexService with the live layer. */
export function runWithOntologyIndex<A, E>(
  effect: Effect.Effect<A, E, OntologyIndexService>
): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(OntologyIndexLive)) as Effect.Effect<A, E>);
}
