import {
  approveSourceEffect,
  decidePendingExecution,
  getPendingSourcesDir,
  listPendingExecutionIdsEffect,
  loadPendingExecution,
  readPendingSourceEffect,
} from "clawql-api";
import { Effect } from "effect";
import { readdir } from "node:fs/promises";

import { REVIEW_ITEMS, type ReviewItem } from "@/lib/managed/fixtures-ops";
import { readManagedDataSource, resolveWithFallbackEffect } from "@/lib/managed/data-source";

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} days ago`;
}

function expiresLine(expiresAt: string): string {
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms)) return "No expiry";
  if (ms <= 0) return "Expired";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `Expires in ${min} min`;
  return `Expires in ${Math.round(min / 60)} hr`;
}

const listPendingSourceIdsEffect = (home?: string): Effect.Effect<readonly string[], Error> =>
  Effect.tryPromise({
    try: async () => {
      try {
        const names = await readdir(getPendingSourcesDir(home));
        return names
          .filter((n) => n.startsWith("psp_") && n.endsWith(".json"))
          .map((n) => n.slice(0, -".json".length));
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return [];
        throw e;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const listManagedReviewEffect = (
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<{ readonly items: ReviewItem[]; readonly source: "live" | "fixture" }> =>
  resolveWithFallbackEffect({
    source: readManagedDataSource(env),
    fixture: [...REVIEW_ITEMS],
    isLiveUseful: (items) => items.length > 0,
    live: Effect.gen(function* () {
      const home = env.CLAWQL_HOME?.trim() || undefined;
      const execIds = yield* listPendingExecutionIdsEffect(home);
      const sourceIds = yield* listPendingSourceIdsEffect(home);
      const items: ReviewItem[] = [];

      for (const id of execIds) {
        const record = yield* Effect.tryPromise({
          try: () => loadPendingExecution(id, home),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        });
        if (!record || record.status !== "pending") continue;
        items.push({
          id: record.executionId,
          kind: "change",
          kindLabel: "CHANGE",
          title: record.operationId,
          badge: `${record.risk.toUpperCase()} risk`,
          badgeTone: record.risk === "block" ? "danger" : record.risk === "mandate" ? "warn" : "neutral",
          listMeta: `Parked ${relativeTime(record.createdAt)}`,
          statusLine: expiresLine(record.expiresAt),
          statusTone: Date.parse(record.expiresAt) - Date.now() < 30 * 60_000 ? "danger" : "neutral",
        });
      }

      for (const id of sourceIds) {
        const record = yield* readPendingSourceEffect(id, home);
        if (!record || record.status !== "pending") continue;
        items.push({
          id: record.proposalId,
          kind: "source",
          kindLabel: "NEW SOURCE",
          title: `Add ${record.entry.name || record.entry.id}`,
          badge: "Proposed by an agent",
          badgeTone: "neutral",
          listMeta: `${record.proposedBy ?? "unknown"}, ${relativeTime(record.createdAt)}`,
          statusLine: expiresLine(record.expiresAt),
          statusTone: "neutral",
        });
      }

      return items;
    }),
  }).pipe(Effect.map(({ data, source }) => ({ items: data, source })));

export type ManagedReviewError = {
  readonly _tag: "ManagedReviewError";
  readonly reason: string;
};

function asReviewError(cause: unknown): ManagedReviewError {
  return {
    _tag: "ManagedReviewError",
    reason: cause instanceof Error ? cause.message : String(cause),
  };
}

export const decideManagedReviewEffect = (input: {
  readonly id: string;
  readonly kind: "change" | "source";
  readonly decision: "approve" | "decline";
  readonly operatorId: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<{ readonly ok: true; readonly id: string; readonly status: string }, ManagedReviewError> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    const home = env.CLAWQL_HOME?.trim() || undefined;

    if (input.kind === "change") {
      const record = yield* Effect.tryPromise({
        try: () => decidePendingExecution(input.id, input.decision, home),
        catch: asReviewError,
      });
      return { ok: true as const, id: record.executionId, status: record.status };
    }

    const result = yield* approveSourceEffect({
      proposalId: input.id,
      decision: input.decision,
      approvedBy: { kind: "operator", id: input.operatorId },
      home,
    }).pipe(Effect.mapError(asReviewError));
    return { ok: true as const, id: result.proposalId, status: result.status };
  });
