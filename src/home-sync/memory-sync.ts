import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { Effect } from "effect";
import { z } from "zod";
import { runSyncPullEffect, runSyncPushEffect, runSyncStatusEffect } from "./engine.js";
import type { SyncRunResult } from "./types.js";
import {
  decodeMemorySyncInput,
  MEMORY_SYNC_DIRECTION_DESCRIPTION,
  MEMORY_SYNC_DRY_RUN_DESCRIPTION,
  MEMORY_SYNC_FORCE_DESCRIPTION,
} from "./memory-sync-schema.js";

/** Thin Zod shape for MCP SDK listing — domain decode via {@link decodeMemorySyncInput}. */
export const memorySyncToolSchema = {
  direction: z
    .enum(["auto", "pull", "push"])
    .optional()
    .describe(MEMORY_SYNC_DIRECTION_DESCRIPTION),
  force: z.boolean().optional().describe(MEMORY_SYNC_FORCE_DESCRIPTION),
  dryRun: z.boolean().optional().describe(MEMORY_SYNC_DRY_RUN_DESCRIPTION),
};

export type MemorySyncDirection = "auto" | "pull" | "push";

export type MemorySyncInput = {
  /** `auto` (default): pull remote changes, then push local changes. `pull` or `push` run one direction only. */
  direction?: MemorySyncDirection;
  /** Overwrite on hash conflicts (default false — conflicts are reported, not applied). */
  force?: boolean;
  /** Plan only; no object storage writes. */
  dryRun?: boolean;
};

export type MemorySyncResult = {
  ok: boolean;
  direction: MemorySyncDirection;
  dryRun: boolean;
  provider: string;
  bucket: string;
  prefix: string;
  pulled: number;
  pushed: number;
  skipped: number;
  conflicts: string[];
  conflictCount: number;
  statusBefore: {
    localCount: number;
    remoteCount: number;
    inSync: number;
    localOnly: string[];
    remoteOnly: string[];
  };
  pull?: SyncRunResult;
  push?: SyncRunResult;
  message: string;
};

function mergeConflicts(pull?: SyncRunResult, push?: SyncRunResult): string[] {
  const paths = new Set<string>();
  for (const run of [pull, push]) {
    if (!run) continue;
    for (const a of run.actions) {
      if (a.action === "conflict") paths.add(a.path);
    }
  }
  return [...paths].sort();
}

function sumSkipped(runs: (SyncRunResult | undefined)[]): number {
  return runs.reduce((n, r) => n + (r?.skipped ?? 0), 0);
}

/**
 * Reconcile the local vault with the remote team bucket.
 * Default `auto`: pull first (remote → local), then push (local → remote).
 */
export function runMemorySyncEffect(
  input: MemorySyncInput = {}
): Effect.Effect<MemorySyncResult, Error> {
  return Effect.gen(function* () {
    const direction: MemorySyncDirection = input.direction ?? "auto";
    const force = Boolean(input.force);
    const dryRun = Boolean(input.dryRun);
    const opts = { force, dryRun };

    const statusBefore = yield* runSyncStatusEffect();

    let pull: SyncRunResult | undefined;
    let push: SyncRunResult | undefined;

    if (direction === "auto" || direction === "pull") {
      pull = yield* runSyncPullEffect(opts);
    }
    if (direction === "auto" || direction === "push") {
      push = yield* runSyncPushEffect(opts);
    }

    const conflicts = mergeConflicts(pull, push);
    const pulled = pull?.downloaded ?? 0;
    const pushed = push?.uploaded ?? 0;
    const skipped = sumSkipped([pull, push]);
    const conflictCount = conflicts.length;
    const ok = conflictCount === 0;

    const parts: string[] = [];
    if (direction === "auto" || direction === "pull") {
      parts.push(`pulled ${pulled} file(s)`);
    }
    if (direction === "auto" || direction === "push") {
      parts.push(`pushed ${pushed} file(s)`);
    }
    if (conflictCount > 0) {
      parts.push(`${conflictCount} conflict(s) — re-run with force:true to overwrite`);
    }
    if (dryRun) {
      parts.push("dry-run only");
    }

    const message =
      parts.length > 0
        ? `memory_sync (${direction}): ${parts.join("; ")}.`
        : `memory_sync (${direction}): nothing to do.`;

    return {
      ok,
      direction,
      dryRun,
      provider: statusBefore.config.provider,
      bucket: statusBefore.config.bucket,
      prefix: statusBefore.config.prefix ?? "",
      pulled,
      pushed,
      skipped,
      conflicts,
      conflictCount,
      statusBefore: {
        localCount: statusBefore.localCount,
        remoteCount: statusBefore.remoteCount,
        inSync: statusBefore.inSync,
        localOnly: statusBefore.localOnly,
        remoteOnly: statusBefore.remoteOnly,
      },
      pull,
      push,
      message,
    };
  });
}

/** Promise façade — prefer {@link runMemorySyncEffect}. */
export async function runMemorySync(input: MemorySyncInput = {}): Promise<MemorySyncResult> {
  return Effect.runPromise(runMemorySyncEffect(input));
}

/** MCP tool host façade — decode + run + shape log. */
export function handleMemorySyncToolInputEffect(
  params: unknown
): Effect.Effect<{ content: { type: "text"; text: string }[] }, Error> {
  return Effect.gen(function* () {
    const parsed = yield* decodeMemorySyncInput(params);
    const result = yield* runMemorySyncEffect(parsed);
    logMcpToolShape("memory_sync", {
      direction: result.direction,
      dryRun: result.dryRun,
      pulled: result.pulled,
      pushed: result.pushed,
      conflictCount: result.conflictCount,
      ok: result.ok,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });
}

/** Promise façade for MCP `server.tool` callbacks. */
export async function handleMemorySyncToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  return Effect.runPromise(handleMemorySyncToolInputEffect(params));
}
