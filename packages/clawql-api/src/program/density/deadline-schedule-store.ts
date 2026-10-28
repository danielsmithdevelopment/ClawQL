/**
 * Durable wake-deadline schedule snapshot for the SHARED_HOST deadline restart test.
 *
 * Layout (fsync'd):
 *   line 1: JSON header { version, capacity, writtenAtMs, farDeadlineMs, liveCount, padCount }
 *   next liveCount lines: `${deadlineMs}\t${agentId}`
 *
 * Pads are not written line-by-line — rebuild calls schedulePad(padCount, farDeadlineMs).
 */

import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import {
  makeTypedDeadlineScheduleEffect,
  type TypedDeadlineSchedule,
} from "./deadline-schedule-typed.js";

export const DEADLINE_SCHEDULE_STORE_VERSION = 1 as const;

export type DeadlineScheduleSnapshotHeader = {
  readonly version: typeof DEADLINE_SCHEDULE_STORE_VERSION;
  readonly capacity: number;
  readonly writtenAtMs: number;
  readonly farDeadlineMs: number;
  readonly liveCount: number;
  readonly padCount: number;
};

export type DeadlineScheduleLiveEntry = {
  readonly agentId: string;
  readonly deadlineMs: number;
};

export type DeadlineScheduleSnapshot = {
  readonly path: string;
  readonly header: DeadlineScheduleSnapshotHeader;
  readonly live: readonly DeadlineScheduleLiveEntry[];
};

export type DeadlineScheduleRebuildResult = {
  readonly schedule: TypedDeadlineSchedule;
  readonly header: DeadlineScheduleSnapshotHeader;
  readonly live: readonly DeadlineScheduleLiveEntry[];
  /** Wall ms to load file + rebuild typed heap (including pads). */
  readonly rebuildMs: number;
};

export function writeDeadlineScheduleSnapshotEffect(args: {
  readonly dir: string;
  readonly capacity: number;
  readonly live: readonly DeadlineScheduleLiveEntry[];
  readonly padCount: number;
  readonly farDeadlineMs: number;
  readonly writtenAtMs?: number;
  readonly fileName?: string;
}): Effect.Effect<DeadlineScheduleSnapshot> {
  return Effect.sync(() => {
    mkdirSync(args.dir, { recursive: true });
    const path = join(args.dir, args.fileName ?? "deadline-schedule.ndjson");
    const writtenAtMs = args.writtenAtMs ?? Date.now();
    const header: DeadlineScheduleSnapshotHeader = {
      version: DEADLINE_SCHEDULE_STORE_VERSION,
      capacity: Math.max(1, Math.floor(args.capacity)),
      writtenAtMs,
      farDeadlineMs: args.farDeadlineMs,
      liveCount: args.live.length,
      padCount: Math.max(0, Math.floor(args.padCount)),
    };
    const fd = openSync(path, "w");
    try {
      writeSync(fd, `${JSON.stringify(header)}\n`);
      for (const row of args.live) {
        writeSync(fd, `${row.deadlineMs}\t${row.agentId}\n`);
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return { path, header, live: args.live };
  });
}

export function readDeadlineScheduleSnapshotEffect(
  path: string
): Effect.Effect<DeadlineScheduleSnapshot> {
  return Effect.sync(() => {
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n").filter((l) => l.length > 0);
    if (lines.length === 0) {
      throw new Error(`empty deadline schedule snapshot: ${path}`);
    }
    const header = JSON.parse(lines[0]!) as DeadlineScheduleSnapshotHeader;
    if (header.version !== DEADLINE_SCHEDULE_STORE_VERSION) {
      throw new Error(`unsupported schedule snapshot version ${header.version}`);
    }
    const live: DeadlineScheduleLiveEntry[] = [];
    for (let i = 1; i < lines.length; i++) {
      const tab = lines[i]!.indexOf("\t");
      if (tab < 0) continue;
      const deadlineMs = Number(lines[i]!.slice(0, tab));
      const agentId = lines[i]!.slice(tab + 1);
      live.push({ agentId, deadlineMs });
    }
    if (live.length !== header.liveCount) {
      throw new Error(
        `schedule snapshot liveCount mismatch: header=${header.liveCount} lines=${live.length}`
      );
    }
    return { path, header, live };
  });
}

/**
 * Rebuild a typed-array schedule from a durable snapshot.
 * Pads are re-created via schedulePad (not replayed line-by-line).
 */
export function rebuildDeadlineScheduleFromSnapshotEffect(
  path: string
): Effect.Effect<DeadlineScheduleRebuildResult> {
  return Effect.gen(function* () {
    const t0 = Date.now();
    const snap = yield* readDeadlineScheduleSnapshotEffect(path);
    const capacity = Math.max(
      snap.header.capacity,
      snap.header.liveCount + snap.header.padCount,
      1
    );
    const schedule = yield* makeTypedDeadlineScheduleEffect(capacity);
    for (const row of snap.live) {
      schedule.schedule(row.agentId, row.deadlineMs);
    }
    if (snap.header.padCount > 0) {
      schedule.schedulePad(snap.header.padCount, snap.header.farDeadlineMs);
    }
    const rebuildMs = Date.now() - t0;
    return {
      schedule,
      header: snap.header,
      live: snap.live,
      rebuildMs,
    };
  });
}
