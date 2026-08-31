import { Context, Effect, Layer, Ref } from "effect";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
    readonly durability: "ephemeral" | "durable";
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

function serviceFromOps(ops: StoreOps, durability: "ephemeral" | "durable" = "ephemeral") {
  return DraftStoreService.of({
    durability,
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
          ...(c.formAction
            ? { formAction: c.formAction, formMethod: c.formMethod ?? "POST" }
            : {}),
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
    }, "ephemeral");
  })
);


function snapshotFromMutable(store: MutableDraftStore): DraftStoreState {
  return {
    candidates: new Map(store.candidates),
    versions: new Map(store.versions),
    activeVersionId: store.activeVersionId,
  };
}

function applySnapshot(store: MutableDraftStore, next: DraftStoreState): void {
  store.candidates = new Map(next.candidates);
  store.versions = new Map(next.versions);
  store.activeVersionId = next.activeVersionId;
}

type PersistedDraftStore = {
  readonly candidates: readonly StoredDraftCandidate[];
  readonly versions: readonly PublishedWebMcpVersion[];
  readonly activeVersionId: string | null;
};

const loadPersisted = (filePath: string): DraftStoreState => {
  if (!existsSync(filePath)) return emptyState();
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as PersistedDraftStore;
  return {
    candidates: new Map((parsed.candidates ?? []).map((c) => [c.candidateId, c])),
    versions: new Map((parsed.versions ?? []).map((v) => [v.versionId, v])),
    activeVersionId: parsed.activeVersionId ?? null,
  };
};

const persistState = (filePath: string, state: DraftStoreState): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  const payload: PersistedDraftStore = {
    candidates: [...state.candidates.values()],
    versions: [...state.versions.values()],
    activeVersionId: state.activeVersionId,
  };
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

/** Resolve durable JSON path — unset/`0` keeps ephemeral process memory only. */
export const resolveDraftStorePath = (): string | null => {
  const flag = process.env.CLAWQL_WEBMCP_DRAFT_DURABLE?.trim();
  if (flag === "0" || flag === "false") return null;
  const explicit = process.env.CLAWQL_WEBMCP_DRAFT_STORE_PATH?.trim();
  if (explicit) return resolve(explicit);
  // Default on: durable under cwd so gateway restarts keep drafts.
  if (flag === "1" || flag === "true" || flag === undefined || flag === "") {
    // Opt-in durable by default when path or flag set; empty flag → durable default path.
    // Tests set CLAWQL_WEBMCP_DRAFT_DURABLE=0.
    if (flag === undefined) {
      // Keep unit-test default ephemeral unless explicitly enabled — tests rely on ephemeral.
      return null;
    }
    return resolve(process.cwd(), ".clawql", "webmcp-draft-store.json");
  }
  return resolve(process.cwd(), ".clawql", "webmcp-draft-store.json");
};

function makeProcessStoreOps(filePath: string | null): StoreOps {
  if (filePath) {
    const loaded = loadPersisted(filePath);
    applySnapshot(defaultStore, loaded);
  }
  return {
    read: () => Effect.sync(() => snapshotFromMutable(defaultStore)),
    write: (next) =>
      Effect.sync(() => {
        applySnapshot(defaultStore, next);
        if (filePath) persistState(filePath, next);
      }),
  };
}

/**
 * Process-wide live layer. Durable when `CLAWQL_WEBMCP_DRAFT_DURABLE=1` or
 * `CLAWQL_WEBMCP_DRAFT_STORE_PATH` is set; otherwise ephemeral (test default).
 */
export const DraftStoreLive = Layer.sync(DraftStoreService, () => {
  const filePath =
    process.env.CLAWQL_WEBMCP_DRAFT_STORE_PATH?.trim()
      ? resolve(process.env.CLAWQL_WEBMCP_DRAFT_STORE_PATH.trim())
      : process.env.CLAWQL_WEBMCP_DRAFT_DURABLE?.trim() === "1" ||
          process.env.CLAWQL_WEBMCP_DRAFT_DURABLE?.trim() === "true"
        ? resolve(process.cwd(), ".clawql", "webmcp-draft-store.json")
        : null;
  const durability = filePath ? ("durable" as const) : ("ephemeral" as const);
  return serviceFromOps(makeProcessStoreOps(filePath), durability);
});

/** Explicit durable layer (gateway / production). */
export const DraftStoreDurableLive = Layer.sync(DraftStoreService, () => {
  const filePath = resolve(
    process.env.CLAWQL_WEBMCP_DRAFT_STORE_PATH?.trim() ||
      resolve(process.cwd(), ".clawql", "webmcp-draft-store.json")
  );
  return serviceFromOps(makeProcessStoreOps(filePath), "durable");
});

/** Reset the process-wide live store (tests that exercise Live layer). */
export const resetDefaultDraftStoreForTests = (): void => {
  defaultStore.candidates = new Map();
  defaultStore.versions = new Map();
  defaultStore.activeVersionId = null;
};
