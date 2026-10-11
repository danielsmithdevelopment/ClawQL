/**
 * Durable Object per repo: rebase winner onto latest main, re-test, merge; stand down losers.
 */
export type MergeJob = {
  taskId: string;
  winnerAttemptId: string;
  winnerFork: string;
  baseCommit: string;
};

export type MergeResult = {
  status: "merged" | "awaiting_approval" | "failed";
  mainCommit?: string;
  reason?: string;
};

/** Pure planning step — actual git ops use artifacts-client + Sandbox in Day 3. */
export function planMerge(job: MergeJob, approved: boolean): MergeResult {
  if (!approved) {
    return { status: "awaiting_approval", reason: "needs_human" };
  }
  return {
    status: "merged",
    mainCommit: `merge_${job.winnerAttemptId}_${job.baseCommit.slice(0, 7)}`,
  };
}

export default {
  async fetch(): Promise<Response> {
    return new Response("merge-queue", { status: 501 });
  },
};
