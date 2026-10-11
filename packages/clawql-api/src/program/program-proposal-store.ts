/**
 * Process-local record of each program's proposals and submitted leaves, for
 * `submit_program_proposals`.
 *
 * Records are namespaced by session key (only the session that ran the program sees
 * them) and live as long as a parked mandate (`CLAWQL_PENDING_EXECUTION_TTL_HOURS`), so a
 * batch can continue after Review. Not shared across replicas: elsewhere, submit with
 * the `proposals` echoed from `execute_program`.
 */

import { Context, Effect, Layer, Option, Semaphore } from "effect";
import type { Label } from "../ifc/labels.js";
import { pendingTtlHours } from "../pending/pending-execution-store.js";
import type { ProposalLeaf, ResolvedProposal } from "./program-proposals.js";

export const PROGRAM_PROPOSAL_STORE_MAX_RECORDS = 256;

export type ProgramProposalRecord = {
  readonly programId: string;
  /** Session label key that ran the program. */
  readonly owner: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly programLabels: readonly Label[];
  readonly proposals: readonly ResolvedProposal[];
  readonly leaves: Readonly<Record<string, ProposalLeaf>>;
};

export type ProgramProposalStoreApi = {
  readonly put: (record: ProgramProposalRecord) => Effect.Effect<void>;
  /** Store `record` unless a live one exists for its program; returns the record kept. */
  readonly putIfAbsent: (record: ProgramProposalRecord) => Effect.Effect<ProgramProposalRecord>;
  readonly get: (
    owner: string,
    programId: string
  ) => Effect.Effect<ProgramProposalRecord | undefined>;
  readonly saveLeaves: (
    owner: string,
    programId: string,
    leaves: Readonly<Record<string, ProposalLeaf>>
  ) => Effect.Effect<void>;
  /** Serializes submits of one program within this process. */
  readonly withProgramLock: <A, E, R>(
    owner: string,
    programId: string,
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>;
  readonly clearAll: () => Effect.Effect<void>;
};

function recordKey(owner: string, programId: string): string {
  return `${owner}\u0000${programId}`;
}

function makeStore(
  opts: { readonly maxRecords?: number; readonly now?: () => number } = {}
): ProgramProposalStoreApi {
  const maxRecords = opts.maxRecords ?? PROGRAM_PROPOSAL_STORE_MAX_RECORDS;
  const now = opts.now ?? Date.now;
  const records = new Map<string, ProgramProposalRecord>();
  // `users` counts holders and waiters: a lock is only dropped when nobody needs it,
  // even for a program whose record does not exist yet.
  const locks = new Map<string, { readonly sem: Semaphore.Semaphore; users: number }>();

  const prune = (): void => {
    const t = now();
    for (const [key, record] of records) {
      if (record.expiresAtMs <= t) records.delete(key);
    }
    while (records.size > maxRecords) {
      const oldest = records.keys().next().value;
      if (oldest === undefined) break;
      records.delete(oldest);
    }
    for (const [key, lock] of locks) {
      if (lock.users === 0 && !records.has(key)) locks.delete(key);
    }
  };

  return {
    put: (record) =>
      Effect.sync(() => {
        const key = recordKey(record.owner, record.programId);
        records.delete(key);
        records.set(key, record);
        prune();
      }),
    putIfAbsent: (record) =>
      Effect.sync(() => {
        prune();
        const key = recordKey(record.owner, record.programId);
        const existing = records.get(key);
        if (existing) return existing;
        records.set(key, record);
        prune();
        return record;
      }),
    get: (owner, programId) =>
      Effect.sync(() => {
        prune();
        return records.get(recordKey(owner, programId));
      }),
    saveLeaves: (owner, programId, leaves) =>
      Effect.sync(() => {
        const key = recordKey(owner, programId);
        const record = records.get(key);
        if (record) records.set(key, { ...record, leaves });
      }),
    withProgramLock: (owner, programId, self) =>
      Effect.suspend(() => {
        const key = recordKey(owner, programId);
        let lock = locks.get(key);
        if (!lock) {
          lock = { sem: Semaphore.makeUnsafe(1), users: 0 };
          locks.set(key, lock);
        }
        const held = lock;
        held.users++;
        return held.sem.withPermit(self).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              held.users--;
            })
          )
        );
      }),
    clearAll: () =>
      Effect.sync(() => {
        records.clear();
        locks.clear();
      }),
  };
}

export class ProgramProposalStore extends Context.Service<
  ProgramProposalStore,
  ProgramProposalStoreApi
>()("clawql/ProgramProposalStore") {}

const processStore = makeStore();

/** Process-wide store shared by `execute_program` and `submit_program_proposals`. */
export const ProgramProposalStoreLive = Layer.succeed(
  ProgramProposalStore,
  ProgramProposalStore.of(processStore)
);

/** Isolated store (tests, embedded hosts). */
export const makeProgramProposalStoreLayer = (
  opts: { readonly maxRecords?: number; readonly now?: () => number } = {}
): Layer.Layer<ProgramProposalStore> =>
  Layer.succeed(ProgramProposalStore, ProgramProposalStore.of(makeStore(opts)));

/** The store provided in context, else the process-wide one. */
export const currentProgramProposalStoreEffect: Effect.Effect<ProgramProposalStoreApi> =
  Effect.serviceOption(ProgramProposalStore).pipe(Effect.map(Option.getOrElse(() => processStore)));

/** How long a record lives: as long as a parked mandate can wait for approval. */
export const programProposalRecordTtlMsEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<number> => Effect.sync(() => pendingTtlHours(env) * 60 * 60 * 1000);
