/**
 * Writes a durable full-scale deadline schedule snapshot, prints READY, then
 * waits to be SIGKILL'd (parent owns the kill + downtime + rebuild).
 */

import { Effect } from "effect";
import { writeDeadlineScheduleSnapshotEffect } from "./deadline-schedule-store.js";

const dir = process.env.CLAWQL_DEADLINE_RESTART_DIR;
if (!dir) {
  console.error("CLAWQL_DEADLINE_RESTART_DIR required");
  process.exit(2);
}

const capacity = Math.max(1, Number(process.env.CLAWQL_DEADLINE_RESTART_CAPACITY || 10_000));
const liveCount = Math.max(2, Number(process.env.CLAWQL_DEADLINE_RESTART_LIVE || 100));
const downtimeHint = Math.max(50, Number(process.env.CLAWQL_DEADLINE_RESTART_DOWNTIME_HINT_MS || 400));

const now = Date.now();
// Half become due during parent downtime; half stay future.
const live = Array.from({ length: liveCount }, (_, i) => {
  const overdueSoon = i % 2 === 0;
  return {
    agentId: `bag_${i.toString(16).padStart(8, "0")}_restart`,
    deadlineMs: overdueSoon ? now + Math.floor(downtimeHint / 4) : now + 60_000 + i,
  };
});
const padCount = Math.max(0, capacity - liveCount);
const farDeadlineMs = now + 3_600_000;

const snap = await Effect.runPromise(
  writeDeadlineScheduleSnapshotEffect({
    dir,
    capacity,
    live,
    padCount,
    farDeadlineMs,
    writtenAtMs: now,
  })
);

process.stdout.write(`SNAPSHOT\t${snap.path}\n`);
process.stdout.write("READY\n");

// Stay alive until parent SIGKILLs.
await new Promise(() => {
  /* park */
});
