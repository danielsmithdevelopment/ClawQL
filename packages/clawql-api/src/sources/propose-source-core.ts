/**
 * Propose / approve custom sources with risk preview (v0.2).
 * Agents propose; a distinct operator approves. MCP never exposes approve.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { appendProcessWormEffect } from "clawql-audit";
import {
  cacheCustomSourceBody,
  loadOperationsForCustomSourceEntry,
} from "../spec/custom-sources-merge.js";
import { detectSourceFromUrl } from "../spec/detect-source-from-url.js";
import {
  ensureSourceCacheDir,
  resolveClawqlHome,
  upsertCustomSource,
} from "../spec/custom-sources-store.js";
import {
  slugifySourceId,
  type CustomSourceEntry,
  type CustomSourceKind,
} from "../spec/custom-sources-types.js";
import { applyOperationRiskToLoadedOps } from "../risk/operation-risk-service.js";
import type { Operation } from "../spec/operation-types.js";
import { name, PrincipalId, ProposalId, type Named } from "clawql-gdp";
import {
  approverMayApproveSourceEffect,
  type ApproverMayApproveSource,
} from "../proofs/approver-may-approve-source.js";
import {
  newProposalIdEffect,
  pendingSourceTtlHoursEffect,
  readPendingSourceEffect,
  updatePendingSourceStatusEffect,
  writePendingSourceEffect,
} from "./pending-source-store.js";
import type {
  PendingSourceRecord,
  ProposedOperationSample,
  SourceRiskSummary,
  SourcesProposePreview,
} from "./pending-source-types.js";
import {
  formatSourceProposalPrincipalEffect,
  type SourceProposalPrincipal,
} from "./source-proposal-principal.js";

export type ProposeSourceParams = {
  readonly url: string;
  readonly name?: string;
  readonly kind?: CustomSourceKind;
  readonly id?: string;
  /** Default true — preview only. Set false to park a proposal for human approve. */
  readonly dryRun?: boolean;
  readonly home?: string;
  readonly fetchFn?: typeof fetch;
  readonly sampleLimit?: number;
  /** Required when parking (`dryRun: false`). MCP uses `agent:`; CLI uses `operator:`. */
  readonly proposedBy?: SourceProposalPrincipal;
};

export type ApproveSourceParams = {
  readonly proposalId: string;
  readonly decision: "approve" | "decline";
  readonly home?: string;
  readonly resetSpecCache?: () => void;
  /** Operator principal. Agent principals are rejected. */
  readonly approvedBy: SourceProposalPrincipal;
};

function summarizeRisk(ops: readonly Operation[]): SourceRiskSummary {
  let allow = 0;
  let mandate = 0;
  let block = 0;
  for (const op of ops) {
    const p = op.risk?.policy;
    if (p === "allow") allow += 1;
    else if (p === "block") block += 1;
    else mandate += 1;
  }
  return { allow, mandate, block, total: ops.length };
}

function sampleOps(ops: readonly Operation[], limit: number): ProposedOperationSample[] {
  return ops.slice(0, limit).map((op) => ({
    id: op.id,
    method: op.method,
    path: op.path,
    risk: op.risk ?? null,
  }));
}

function buildEntryFromDetected(
  params: ProposeSourceParams,
  detected: Awaited<ReturnType<typeof detectSourceFromUrl>>,
  home: string
): Effect.Effect<CustomSourceEntry, Error> {
  return Effect.tryPromise({
    try: async () => {
      const id = params.id?.trim() || slugifySourceId(params.name ?? detected.name ?? params.url);
      await ensureSourceCacheDir(id, home);
      const url = params.url.trim();
      let entry: CustomSourceEntry = {
        id,
        name: params.name?.trim() || detected.name || id,
        kind: detected.kind,
        addedAt: new Date().toISOString(),
        url,
      };

      if (detected.kind === "mcp") {
        entry = { ...entry, mcpUrl: url };
      } else if (detected.kind === "webmcp") {
        entry = { ...entry, webmcpPageUrl: url };
      } else if (detected.kind === "graphql") {
        entry = {
          ...entry,
          graphqlEndpoint: detected.graphqlEndpoint || url,
        };
        if (detected.bodyText) {
          entry = await cacheCustomSourceBody(entry, detected.bodyText, home);
        }
      } else if (detected.kind === "grpc") {
        const protoAbs = join(home, "sources", id, "service.proto");
        if (detected.bodyText) {
          await writeFile(protoAbs, detected.bodyText, "utf8");
        }
        entry = {
          ...entry,
          grpcEndpoint: "localhost:50051",
          protoPath: `sources/${id}/service.proto`,
          grpcInsecure: true,
        };
      } else if (detected.bodyText) {
        entry = await cacheCustomSourceBody(entry, detected.bodyText, home);
      }

      return entry;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

function sessionId(): string {
  return process.env.CLAWQL_SESSION_ID?.trim() || "sources-propose";
}

export function proposeSourceEffect(
  params: ProposeSourceParams
): Effect.Effect<SourcesProposePreview, Error> {
  return Effect.gen(function* () {
    const home = params.home ?? resolveClawqlHome();
    const dryRun = params.dryRun !== false;
    const sampleLimit = params.sampleLimit ?? 12;

    const detected = yield* Effect.tryPromise({
      try: () =>
        detectSourceFromUrl(params.url, {
          kindHint: params.kind,
          fetchFn: params.fetchFn,
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const entry = yield* buildEntryFromDetected(params, detected, home);

    const rawOps = yield* Effect.tryPromise({
      try: () => loadOperationsForCustomSourceEntry(entry, home),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const trusted = entry.kind === "mcp" && entry.trusted === true ? [entry.id] : ([] as string[]);
    const withRisk = yield* Effect.tryPromise({
      try: () =>
        applyOperationRiskToLoadedOps(rawOps, {
          extraTrustedMcpSources: trusted,
          home,
          wormLogOverrides: false,
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const riskSummary = summarizeRisk(withRisk);
    const sampleOperations = sampleOps(withRisk, sampleLimit);

    if (dryRun) {
      return {
        ok: true as const,
        dryRun: true,
        proposalId: null,
        entry: {
          id: entry.id,
          name: entry.name,
          kind: entry.kind,
          url: entry.url,
          mcpUrl: entry.mcpUrl,
          cachePath: entry.cachePath,
        },
        riskSummary,
        sampleOperations,
        expiresAt: null,
        approval: null,
      };
    }

    if (!params.proposedBy) {
      return yield* Effect.fail(
        new Error("proposedBy is required to park a source proposal (two-party gate)")
      );
    }
    const proposedBy = yield* formatSourceProposalPrincipalEffect(params.proposedBy);

    const proposalId = yield* newProposalIdEffect();
    const ttlHours = yield* pendingSourceTtlHoursEffect();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();
    const record: PendingSourceRecord = {
      version: 2,
      proposalId,
      entry,
      riskSummary,
      sampleOperations,
      status: "pending",
      createdAt,
      expiresAt,
      decidedAt: null,
      proposedBy,
      approvedBy: null,
    };
    yield* writePendingSourceEffect(record, home);
    yield* appendProcessWormEffect({
      type: "HUMAN_DECISION_REQUESTED",
      timestamp: createdAt,
      sessionId: sessionId(),
      metadata: {
        kind: "sources_propose",
        proposalId,
        sourceId: entry.id,
        sourceKind: entry.kind,
        riskSummary,
        proposedBy,
      },
    });

    return {
      ok: true as const,
      dryRun: false,
      proposalId,
      entry: {
        id: entry.id,
        name: entry.name,
        kind: entry.kind,
        url: entry.url,
        mcpUrl: entry.mcpUrl,
        cachePath: entry.cachePath,
      },
      riskSummary,
      sampleOperations,
      expiresAt,
      approval: {
        cli: `clawql sources approve ${proposalId}`,
        declineCli: `clawql sources decline ${proposalId}`,
        surface: "operator" as const,
      },
    };
  });
}

export type ApproveSourceResult = {
  readonly ok: true;
  readonly decision: "approve" | "decline";
  readonly proposalId: string;
  readonly sourceId: string;
  readonly status: "approved" | "declined";
};

type CommitApprovedSourceCtx = {
  readonly record: PendingSourceRecord;
  readonly home: string;
  readonly decision: "approve" | "decline";
  readonly approvedByFormatted: string;
  readonly decidedAt: string;
  readonly resetSpecCache?: () => void;
};

/**
 * Sensitive: writes sources.json / declines. Demands ApproverMayApproveSource
 * about the exact named approver + proposal (gdp-ts).
 */
export function commitApprovedSourceEffect<A, P>(
  _approver: Named<A, ReturnType<typeof PrincipalId>>,
  proposal: Named<P, ReturnType<typeof ProposalId>>,
  _proof: ApproverMayApproveSource<A, P>,
  ctx: CommitApprovedSourceCtx
): Effect.Effect<ApproveSourceResult, Error> {
  return Effect.gen(function* () {
    const existing = ctx.record;
    if (proposal.value !== existing.proposalId) {
      return yield* Effect.fail(new Error("Named proposal does not match pending record"));
    }

    if (ctx.decision === "decline") {
      yield* updatePendingSourceStatusEffect(
        existing.proposalId,
        { status: "declined", decidedAt: ctx.decidedAt, approvedBy: ctx.approvedByFormatted },
        ctx.home
      );
      yield* appendProcessWormEffect({
        type: "HUMAN_REJECTION",
        timestamp: ctx.decidedAt,
        sessionId: sessionId(),
        metadata: {
          kind: "sources_propose",
          proposalId: existing.proposalId,
          sourceId: existing.entry.id,
          proposedBy: existing.proposedBy,
          approvedBy: ctx.approvedByFormatted,
        },
      });
      return {
        ok: true as const,
        decision: "decline" as const,
        proposalId: existing.proposalId,
        sourceId: existing.entry.id,
        status: "declined" as const,
      };
    }

    yield* Effect.tryPromise({
      try: () => upsertCustomSource(existing.entry, ctx.home),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    if (ctx.resetSpecCache) {
      yield* Effect.sync(() => {
        ctx.resetSpecCache!();
      });
    }
    yield* updatePendingSourceStatusEffect(
      existing.proposalId,
      { status: "approved", decidedAt: ctx.decidedAt, approvedBy: ctx.approvedByFormatted },
      ctx.home
    );
    yield* appendProcessWormEffect({
      type: "HUMAN_APPROVAL",
      timestamp: ctx.decidedAt,
      sessionId: sessionId(),
      metadata: {
        kind: "sources_propose",
        proposalId: existing.proposalId,
        sourceId: existing.entry.id,
        sourceKind: existing.entry.kind,
        proposedBy: existing.proposedBy,
        approvedBy: ctx.approvedByFormatted,
      },
    });

    return {
      ok: true as const,
      decision: "approve" as const,
      proposalId: existing.proposalId,
      sourceId: existing.entry.id,
      status: "approved" as const,
    };
  });
}

export function approveSourceEffect(
  params: ApproveSourceParams
): Effect.Effect<ApproveSourceResult, Error> {
  return Effect.gen(function* () {
    const home = params.home ?? resolveClawqlHome();
    if (params.approvedBy.kind !== "operator") {
      return yield* Effect.fail(
        new Error("sources_approve is operator-only: agents are never issued this capability")
      );
    }
    const existing = yield* readPendingSourceEffect(params.proposalId, home);
    if (!existing) {
      return yield* Effect.fail(new Error(`Unknown proposalId: ${params.proposalId}`));
    }
    if (existing.status !== "pending") {
      return yield* Effect.fail(
        new Error(`Proposal ${params.proposalId} is not pending (status=${existing.status})`)
      );
    }
    if (Date.parse(existing.expiresAt) <= Date.now()) {
      yield* updatePendingSourceStatusEffect(
        params.proposalId,
        { status: "expired", decidedAt: new Date().toISOString() },
        home
      );
      return yield* Effect.fail(new Error(`Proposal ${params.proposalId} has expired`));
    }

    const decidedAt = new Date().toISOString();
    const approvedByFormatted = yield* formatSourceProposalPrincipalEffect(params.approvedBy);

    return yield* name(
      PrincipalId(approvedByFormatted),
      ProposalId(params.proposalId),
      (approver, proposal) =>
        Effect.gen(function* () {
          const proof = yield* approverMayApproveSourceEffect(approver, proposal, {
            proposedBy: existing.proposedBy,
            approvedBy: params.approvedBy,
          });
          if (!proof) {
            return yield* Effect.fail(
              new Error("ApproverMayApproveSource proof failed (operator + two-party gate)")
            );
          }
          return yield* commitApprovedSourceEffect(approver, proposal, proof, {
            record: existing,
            home,
            decision: params.decision,
            approvedByFormatted,
            decidedAt,
            resetSpecCache: params.resetSpecCache,
          });
        })
    );
  });
}
