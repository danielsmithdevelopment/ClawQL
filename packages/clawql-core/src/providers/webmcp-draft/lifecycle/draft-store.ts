import { Context, Effect, Layer, Ref } from "effect";
import { createHash, randomUUID } from "node:crypto";
import {
  WebMcpDraftInvalidStateError,
  WebMcpDraftNotFoundError,
  WebMcpPublishVersionNotFoundError,
} from "../errors.js";
import type {
  BoundOperation,
  DraftCandidate,
  ProposedWebMcpTool,
  PublishedWebMcpVersion,
  StoredDraftCandidate,
} from "../types.js";

export type DraftStoreState = {
  readonly candidates: ReadonlyMap<string, StoredDraftCandidate>;
  readonly versions: ReadonlyMap<string, PublishedWebMcpVersion>;
  readonly activeVersionId: string | null;
};

const emptyState = (): DraftStoreState => ({
  candidates: new Map(),
  versions: new Map(),
  activeVersionId: null,
});

/** Mutable process-wide store so MCP handler invocations share draft/publish state. */
type MutableDraftStore = {
  candidates: Map<string, StoredDraftCandidate>;
  versions: Map<string, PublishedWebMcpVersion>;
  activeVersionId: string | null;
};

const defaultStore: MutableDraftStore = {
  candidates: new Map(),
  versions: new Map(),
  activeVersionId: null,
};

export class DraftStoreService extends Context.Tag("clawql/webmcp-draft/DraftStoreService")<
  DraftStoreService,
  {
    /** Stub stores are process-local — restart loses unreviewed drafts with no durable error. */
    readonly durability: "ephemeral";
    readonly putCandidates: (
      candidates: readonly DraftCandidate[]
    ) => Effect.Effect<readonly StoredDraftCandidate[]>;
    readonly getCandidate: (
      candidateId: string
    ) => Effect.Effect<StoredDraftCandidate, WebMcpDraftNotFoundError>;
    readonly listCandidates: (
      status?: StoredDraftCandidate["status"]
    ) => Effect.Effect<readonly StoredDraftCandidate[]>;
    readonly markReviewed: (input: {
      readonly candidateId: string;
      readonly status: "approved" | "rejected";
      readonly reviewedBy: string;
      readonly editedTool?: Partial<ProposedWebMcpTool>;
    }) => Effect.Effect<StoredDraftCandidate, WebMcpDraftNotFoundError | WebMcpDraftInvalidStateError>;
    readonly publishApproved: (input: {
      readonly publishedBy: string;
      readonly candidateIds?: readonly string[];
    }) => Effect.Effect<PublishedWebMcpVersion, WebMcpDraftNotFoundError | WebMcpDraftInvalidStateError>;
    readonly getActiveVersion: () => Effect.Effect<PublishedWebMcpVersion | null>;
    readonly getVersion: (
      versionId: string
    ) => Effect.Effect<PublishedWebMcpVersion, WebMcpPublishVersionNotFoundError>;
    readonly rollbackToVersion: (input: {
      readonly versionId: string;
      readonly publishedBy: string;
    }) => Effect.Effect<PublishedWebMcpVersion, WebMcpPublishVersionNotFoundError>;
    readonly resetForTests: () => Effect.Effect<void>;
  }
>() {}

function resolveTool(candidate: StoredDraftCandidate): ProposedWebMcpTool {
  if (!candidate.editedTool) return candidate.proposedTool;
  return {
    name: candidate.editedTool.name ?? candidate.proposedTool.name,
    description: candidate.editedTool.description ?? candidate.proposedTool.description,
    inputSchema: candidate.editedTool.inputSchema ?? candidate.proposedTool.inputSchema,
  };
}

function versionIdFor(tools: readonly ProposedWebMcpTool[]): string {
  const payload = JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description })));
  return `ver_${createHash("sha256").update(payload).digest("hex").slice(0, 16)}`;
}

type StoreOps = {
  readonly read: () => Effect.Effect<DraftStoreState>;
  readonly write: (next: DraftStoreState) => Effect.Effect<void>;
};

function serviceFromOps(ops: StoreOps) {
  return DraftStoreService.of({
    durability: "ephemeral",
    putCandidates: (candidates) =>
      Effect.gen(function* () {
        const stored: StoredDraftCandidate[] = candidates.map((c) => ({
          ...c,
          status: "pending" as const,
        }));
        const s = yield* ops.read();
        const next = new Map(s.candidates);
        for (const c of stored) next.set(c.candidateId, c);
        yield* ops.write({ ...s, candidates: next });
        return stored;
      }),

    getCandidate: (candidateId) =>
      Effect.gen(function* () {
        const s = yield* ops.read();
        const found = s.candidates.get(candidateId);
        if (!found) return yield* Effect.fail(new WebMcpDraftNotFoundError({ candidateId }));
        return found;
      }),

    listCandidates: (status) =>
      Effect.gen(function* () {
        const s = yield* ops.read();
        const all = [...s.candidates.values()];
        return status ? all.filter((c) => c.status === status) : all;
      }),

    markReviewed: (input) =>
      Effect.gen(function* () {
        const s = yield* ops.read();
        const found = s.candidates.get(input.candidateId);
        if (!found) {
          return yield* Effect.fail(
            new WebMcpDraftNotFoundError({ candidateId: input.candidateId })
          );
        }
        if (found.status !== "pending") {
          return yield* Effect.fail(
            new WebMcpDraftInvalidStateError({
              candidateId: input.candidateId,
              status: found.status,
              reason: "only pending candidates can be reviewed",
            })
          );
        }
        const updated: StoredDraftCandidate = {
          ...found,
          status: input.status,
          reviewedBy: input.reviewedBy,
          reviewedAt: new Date().toISOString(),
          ...(input.editedTool ? { editedTool: input.editedTool } : {}),
        };
        const next = new Map(s.candidates);
        next.set(input.candidateId, updated);
        yield* ops.write({ ...s, candidates: next });
        return updated;
      }),

    publishApproved: (input) =>
      Effect.gen(function* () {
        const s = yield* ops.read();
        const approved = [...s.candidates.values()].filter((c) => {
          if (c.status !== "approved") return false;
          if (input.candidateIds && !input.candidateIds.includes(c.candidateId)) return false;
          return true;
        });
        if (approved.length === 0) {
          return yield* Effect.fail(
            new WebMcpDraftInvalidStateError({
              candidateId: input.candidateIds?.[0] ?? "(none)",
              status: "approved",
              reason: "no approved candidates to publish",
            })
          );
        }
        const publishedTools = approved.map(resolveTool);
        const bindings: BoundOperation[] = approved.map((c) => ({
          toolName: resolveTool(c).name,
          sourceType: c.sourceType,
          sourceRef: c.sourceRef,
        }));
        const version: PublishedWebMcpVersion = {
          versionId: `${versionIdFor(publishedTools)}_${randomUUID().slice(0, 8)}`,
          publishedTools,
          bindings,
          publishedAt: new Date().toISOString(),
          publishedBy: input.publishedBy,
          previousVersionId: s.activeVersionId,
        };
        const candidates = new Map(s.candidates);
        for (const c of approved) {
          candidates.set(c.candidateId, { ...candidates.get(c.candidateId)!, status: "published" });
        }
        const versions = new Map(s.versions);
        versions.set(version.versionId, version);
        yield* ops.write({
          candidates,
          versions,
          activeVersionId: version.versionId,
        });
        return version;
      }),

    getActiveVersion: () =>
      Effect.gen(function* () {
        const s = yield* ops.read();
        if (!s.activeVersionId) return null;
        return s.versions.get(s.activeVersionId) ?? null;
      }),

    getVersion: (versionId) =>
      Effect.gen(function* () {
        const s = yield* ops.read();
        const found = s.versions.get(versionId);
        if (!found) {
          return yield* Effect.fail(new WebMcpPublishVersionNotFoundError({ versionId }));
        }
        return found;
      }),

    rollbackToVersion: (input) =>
      Effect.gen(function* () {
        const s = yield* ops.read();
        const prior = s.versions.get(input.versionId);
        if (!prior) {
          return yield* Effect.fail(
            new WebMcpPublishVersionNotFoundError({ versionId: input.versionId })
          );
        }
        const version: PublishedWebMcpVersion = {
          versionId: `ver_rollback_${randomUUID().slice(0, 12)}`,
          publishedTools: prior.publishedTools,
          bindings: prior.bindings,
          publishedAt: new Date().toISOString(),
          publishedBy: input.publishedBy,
          previousVersionId: s.activeVersionId,
        };
        const versions = new Map(s.versions);
        versions.set(version.versionId, version);
        yield* ops.write({ ...s, versions, activeVersionId: version.versionId });
        return version;
      }),

    resetForTests: () => ops.write(emptyState()),
  });
}

/** Isolated in-memory draft store for unit tests. */
export const DraftStoreTestLayer = Layer.effect(
  DraftStoreService,
  Effect.gen(function* () {
    const stateRef = yield* Ref.make(emptyState());
    return serviceFromOps({
      read: () => Ref.get(stateRef),
      write: (next) => Ref.set(stateRef, next),
    });
  })
);

/** Process-wide live layer (shared across MCP handler invocations until durable backend lands). */
export const DraftStoreLive = Layer.sync(DraftStoreService, () =>
  serviceFromOps({
    read: () =>
      Effect.sync(() => ({
        candidates: new Map(defaultStore.candidates),
        versions: new Map(defaultStore.versions),
        activeVersionId: defaultStore.activeVersionId,
      })),
    write: (next) =>
      Effect.sync(() => {
        defaultStore.candidates = new Map(next.candidates);
        defaultStore.versions = new Map(next.versions);
        defaultStore.activeVersionId = next.activeVersionId;
      }),
  })
);

/** Reset the process-wide live store (tests that exercise Live layer). */
export const resetDefaultDraftStoreForTests = (): void => {
  defaultStore.candidates = new Map();
  defaultStore.versions = new Map();
  defaultStore.activeVersionId = null;
};
