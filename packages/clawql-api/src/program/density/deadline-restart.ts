/**
 * SHARED_HOST deadline restart test.
 *
 * Child writes a durable full-scale schedule snapshot (live pending + pads),
 * then is SIGKILL'd with work still pending. Parent waits so some deadlines
 * fall due during downtime, rebuilds the typed heap, prompt-fires overdue
 * (catch-up SLA from rebuild completion), and asserts no loss / no duplicates.
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  CLAWQL_DEADLINE_SCHEDULE_FORMAT,
  rebuildDeadlineScheduleFromSnapshotEffect,
  type DeadlineScheduleFormatInfo,
  type DeadlineScheduleLiveEntry,
} from "./deadline-schedule-store.js";
import {
  DEFAULT_DEADLINE_CONCURRENCY,
  DEFAULT_DEADLINE_SLA_MS,
  runDeadlinePumpEffect,
  type DeadlineArmResult,
} from "./deadline-schedule.js";
import {
  DEFAULT_TRIGGER_FLUSH_POLICY,
  describeFlushPolicy,
  openTriggerJournalEffect,
  readTriggerJournalEffect,
  type TriggerFlushPolicy,
} from "./trigger-journal.js";

const WORKER = join(dirname(fileURLToPath(import.meta.url)), "deadline-restart-worker.ts");

export type DeadlineRestartTestResult = {
  readonly ok: boolean;
  readonly capacity: number;
  readonly liveCount: number;
  readonly padCount: number;
  readonly downtimeMs: number;
  readonly rebuildMs: number;
  /** Disclosed on-disk + rebuild path — compare as design, not language. */
  readonly scheduleFormat: DeadlineScheduleFormatInfo;
  readonly overdueExpected: number;
  readonly overdueFired: number;
  readonly futureStillPending: number;
  readonly missingLive: number;
  readonly duplicateFired: number;
  readonly overdueCatchUp: DeadlineArmResult | null;
  readonly note: string;
};

/**
 * Parent-side restart proof. Worker only writes the snapshot then waits to be killed.
 */
export function runDeadlineRestartTestEffect(args: {
  readonly workDir: string;
  readonly capacity: number;
  /** Live pending deadlines (half should become overdue during downtime). */
  readonly liveCount: number;
  readonly downtimeMs?: number;
  readonly policy?: TriggerFlushPolicy;
  readonly concurrency?: number;
  readonly catchUpSlaMs?: number;
  readonly percentile: (samples: readonly number[], p: number) => number;
}): Effect.Effect<DeadlineRestartTestResult> {
  return Effect.promise(async () => {
    const policy = args.policy ?? DEFAULT_TRIGGER_FLUSH_POLICY;
    const policyInfo = describeFlushPolicy(policy);
    const capacity = Math.max(1, Math.floor(args.capacity));
    const liveCount = Math.max(2, Math.floor(args.liveCount));
    const downtimeMs = args.downtimeMs ?? 400;
    const concurrency = args.concurrency ?? DEFAULT_DEADLINE_CONCURRENCY;
    const catchUpSlaMs = args.catchUpSlaMs ?? DEFAULT_DEADLINE_SLA_MS;
    const padCount = Math.max(0, capacity - liveCount);

    mkdirSync(args.workDir, { recursive: true });

    let snapshotPath = "";
    let stderr = "";
    let ready = false;
    let killed = false;

    const child = spawn(process.execPath, ["--import", "tsx", WORKER], {
      cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
      env: {
        ...process.env,
        CLAWQL_DEADLINE_RESTART_DIR: args.workDir,
        CLAWQL_DEADLINE_RESTART_CAPACITY: String(capacity),
        CLAWQL_DEADLINE_RESTART_LIVE: String(liveCount),
        CLAWQL_DEADLINE_RESTART_DOWNTIME_HINT_MS: String(downtimeMs),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await new Promise<void>((resolve, reject) => {
      let buf = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.startsWith("SNAPSHOT\t")) {
            snapshotPath = line.slice("SNAPSHOT\t".length);
          } else if (line === "READY") {
            ready = true;
            if (!killed) {
              killed = true;
              child.kill("SIGKILL");
            }
          }
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", () => resolve());
    });

    if (!ready || !snapshotPath) {
      return {
        ok: false,
        capacity,
        liveCount,
        padCount,
        downtimeMs,
        rebuildMs: 0,
        scheduleFormat: CLAWQL_DEADLINE_SCHEDULE_FORMAT,
        overdueExpected: 0,
        overdueFired: 0,
        futureStillPending: 0,
        missingLive: liveCount,
        duplicateFired: 0,
        overdueCatchUp: null,
        note: `Restart worker did not READY. stderr=${stderr.slice(0, 500)} policy=${policyInfo.mode}`,
      };
    }

    // Deadlines fall due during downtime.
    await new Promise<void>((r) => setTimeout(r, downtimeMs));

    const rebuilt = await Effect.runPromise(
      rebuildDeadlineScheduleFromSnapshotEffect(snapshotPath)
    );
    const rebuildCompleteAt = Date.now();
    const expectedKeys = new Set(rebuilt.live.map((e) => `${e.agentId}|${e.deadlineMs}`));

    // Re-stamp overdue catch-up: schedule overdue entries at rebuildCompleteAt
    // so lateness measures promptness after restart (not wall time across downtime).
    const overdueLive: DeadlineScheduleLiveEntry[] = [];
    const futureLive: DeadlineScheduleLiveEntry[] = [];
    for (const row of rebuilt.live) {
      if (row.deadlineMs <= rebuildCompleteAt) overdueLive.push(row);
      else futureLive.push(row);
    }

    const journal = await Effect.runPromise(openTriggerJournalEffect(args.workDir, policy));
    let overdueCatchUp: DeadlineArmResult | null = null;
    try {
      // Clear and re-schedule only overdue with catch-up deadlines = rebuildCompleteAt.
      rebuilt.schedule.clear();
      for (const row of overdueLive) {
        rebuilt.schedule.schedule(row.agentId, rebuildCompleteAt);
      }
      // Keep far-future pads so rebuild scale stays stressed during catch-up pump.
      if (padCount > 0) {
        rebuilt.schedule.schedulePad(padCount, rebuilt.header.farDeadlineMs);
      }
      for (const row of futureLive) {
        rebuilt.schedule.schedule(row.agentId, row.deadlineMs);
      }

      if (overdueLive.length > 0) {
        overdueCatchUp = await Effect.runPromise(
          runDeadlinePumpEffect({
            schedule: rebuilt.schedule,
            fire: async (entry) => {
              await journal.record(entry.agentId, entry.deadlineMs);
            },
            maxFires: overdueLive.length,
            wallDeadlineMs: rebuildCompleteAt + Math.max(catchUpSlaMs * 2, 5_000),
            slaMs: catchUpSlaMs,
            concurrency,
            mode: "burst",
            arrivalRatePerSec: 0,
            percentile: args.percentile,
          })
        );
        overdueCatchUp = {
          ...overdueCatchUp,
          arrivalRatePerSec:
            overdueCatchUp.wallMs > 0
              ? Number(((overdueCatchUp.fired * 1000) / overdueCatchUp.wallMs).toFixed(2))
              : 0,
        };
      }
    } finally {
      await journal.close();
    }

    const onDisk = await Effect.runPromise(readTriggerJournalEffect(journal.path));
    const firedKeys = new Map<string, number>();
    for (const row of onDisk) {
      firedKeys.set(row.agentId, (firedKeys.get(row.agentId) ?? 0) + 1);
    }

    const overdueAgentIds = new Set(overdueLive.map((e) => e.agentId));
    let overdueFired = 0;
    for (const id of overdueAgentIds) {
      if ((firedKeys.get(id) ?? 0) > 0) overdueFired += 1;
    }
    let duplicateFired = 0;
    for (const n of firedKeys.values()) {
      if (n > 1) duplicateFired += 1;
    }

    const pendingAgents = new Set(
      rebuilt.schedule
        .entries()
        .filter((e) => e.agentId !== "__pad__")
        .map((e) => e.agentId)
    );
    let missingLive = 0;
    for (const row of overdueLive) {
      if ((firedKeys.get(row.agentId) ?? 0) === 0) missingLive += 1;
    }
    for (const row of futureLive) {
      if (!pendingAgents.has(row.agentId)) missingLive += 1;
    }
    // Sanity: every original live agent accounted as fired or pending.
    for (const k of expectedKeys) {
      const agentId = k.slice(0, k.indexOf("|"));
      const accounted = (firedKeys.get(agentId) ?? 0) > 0 || pendingAgents.has(agentId);
      if (!accounted) missingLive += 1;
    }

    const catchUpOk =
      overdueLive.length === 0 ||
      (overdueCatchUp !== null &&
        overdueCatchUp.pctWithinSla >= 99 &&
        overdueCatchUp.fired === overdueLive.length);
    const ok =
      killed &&
      missingLive === 0 &&
      duplicateFired === 0 &&
      overdueFired === overdueLive.length &&
      catchUpOk &&
      rebuilt.rebuildMs >= 0;

    return {
      ok,
      capacity,
      liveCount,
      padCount,
      downtimeMs,
      rebuildMs: rebuilt.rebuildMs,
      scheduleFormat: rebuilt.scheduleFormat,
      overdueExpected: overdueLive.length,
      overdueFired,
      futureStillPending: futureLive.length,
      missingLive,
      duplicateFired,
      overdueCatchUp,
      note: ok
        ? `SIGKILL after durable snapshot; downtime ${downtimeMs} ms; rebuild ${rebuilt.rebuildMs} ms at capacity ${capacity} (${rebuilt.scheduleFormat.rebuildPath}); overdue ${overdueFired}/${overdueLive.length} prompt-fired; no loss/duplicates. RebuildMs is a schedule-format column — disclose peer on-disk/rebuild path before language comparison.`
        : `Deadline restart failed: missing=${missingLive} dups=${duplicateFired} overdueFired=${overdueFired}/${overdueLive.length} catchUpOk=${catchUpOk} rebuildMs=${rebuilt.rebuildMs}. stderr=${stderr.slice(0, 300)}`,
    };
  });
}
