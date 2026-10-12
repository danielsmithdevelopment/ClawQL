/**
 * Agent MCP tools (also exposable from workers/api).
 * Demo must not depend on a private ClawQL service — these are self-contained.
 */

import type { Attempt, Task } from "@artifacts-attempts/shared";
import type { EvidenceNote } from "@artifacts-attempts/notes";

export type ToolContext = {
  task: Task;
  attempts: Attempt[];
  notes: EvidenceNote[];
  /** Attempt id of the calling agent */
  selfAttemptId: string;
  claimedPaths: Map<string, string>; // path -> attemptId
};

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export function taskGet(ctx: ToolContext): ToolResult {
  const self = ctx.attempts.find((a) => a.id === ctx.selfAttemptId);
  if (!self) return { ok: false, error: "unknown attempt" };
  return {
    ok: true,
    data: {
      prompt: ctx.task.prompt,
      baseCommit: ctx.task.baseCommit,
      fork: self.fork,
      taskId: ctx.task.id,
      attemptId: self.id,
    },
  };
}

export function attemptStatus(ctx: ToolContext): ToolResult {
  return {
    ok: true,
    data: ctx.attempts.map((a) => {
      const note = [...ctx.notes].reverse().find((n) => n.attemptId === a.id);
      return {
        id: a.id,
        status: a.status,
        latestCommit: a.latestCommit ?? null,
        evidence: note
          ? {
              tests: note.tests,
              policy: note.policy,
              diff: note.diff,
              hash: note.hash,
            }
          : null,
      };
    }),
  };
}

export function evidenceGet(ctx: ToolContext, commit: string): ToolResult {
  const note = ctx.notes.find((n) => n.commit === commit);
  if (!note) return { ok: false, error: `no evidence for ${commit}` };
  return { ok: true, data: note };
}

export function claimPaths(ctx: ToolContext, paths: string[]): ToolResult {
  const overlaps: Array<{ path: string; heldBy: string }> = [];
  for (const p of paths) {
    const holder = ctx.claimedPaths.get(p);
    if (holder && holder !== ctx.selfAttemptId) {
      overlaps.push({ path: p, heldBy: holder });
    }
  }
  if (overlaps.length) {
    return { ok: false, error: `overlap: ${JSON.stringify(overlaps)}` };
  }
  for (const p of paths) {
    ctx.claimedPaths.set(p, ctx.selfAttemptId);
  }
  return { ok: true, data: { claimed: paths, by: ctx.selfAttemptId } };
}

export const TOOL_NAMES = ["task_get", "attempt_status", "evidence_get", "claim_paths"] as const;

export function dispatchTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown> = {}
): ToolResult {
  switch (name) {
    case "task_get":
      return taskGet(ctx);
    case "attempt_status":
      return attemptStatus(ctx);
    case "evidence_get":
      return evidenceGet(ctx, String(args.commit ?? ""));
    case "claim_paths":
      return claimPaths(ctx, Array.isArray(args.paths) ? (args.paths as string[]) : []);
    default:
      return { ok: false, error: `unknown tool: ${name}` };
  }
}
