/**
 * Child entry for trigger-journal crash tests. Spawned by
 * runTriggerJournalCrashTestEffect — do not import from board code.
 *
 * Env: CLAWQL_CRASH_JOURNAL_DIR, CLAWQL_CRASH_FLUSH_POLICY (JSON),
 *      CLAWQL_CRASH_TOTAL, CLAWQL_CRASH_CONCURRENCY
 */
import { Effect } from "effect";
import { openTriggerJournalEffect, type TriggerFlushPolicy } from "./trigger-journal.js";

async function main(): Promise<void> {
  const dir = process.env.CLAWQL_CRASH_JOURNAL_DIR;
  if (!dir) throw new Error("CLAWQL_CRASH_JOURNAL_DIR required");
  const policy = JSON.parse(
    process.env.CLAWQL_CRASH_FLUSH_POLICY ||
      '{"mode":"group_commit","batchMax":64,"flushIntervalMs":10}'
  ) as TriggerFlushPolicy;
  const total = Number(process.env.CLAWQL_CRASH_TOTAL || 2000);
  const concurrency = Number(process.env.CLAWQL_CRASH_CONCURRENCY || 32);

  const journal = await Effect.runPromise(openTriggerJournalEffect(dir, policy));
  process.stdout.write(`JOURNAL\t${journal.path}\n`);

  let next = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      const agentId = `crash_${i}`;
      const deadlineMs = 1_700_000_000_000 + i;
      await journal.record(agentId, deadlineMs);
      process.stdout.write(`ACK\t${agentId}\t${deadlineMs}\n`);
    }
  });
  await Promise.all(workers);
  await journal.close();
  process.stdout.write("DONE\n");
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
