/**
 * Shared TaskView builders for board hydrate / hydrate-from / approval path.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LocalDemoResult } from "@artifacts-attempts/pipeline";

export type BoardCanaryView = {
  mode: "dry-run" | "live";
  canaryPercent: number;
  rollbackTrigger: string;
  versionId: string;
  previousPercent: number;
};

export type BoardTaskView = {
  task: LocalDemoResult["task"];
  attempts: LocalDemoResult["attempts"];
  notes: LocalDemoResult["notes"];
  decision: LocalDemoResult["decision"];
  pendingApproval: boolean;
  arweaveId: string;
  canary: BoardCanaryView;
};

/** Serializable snapshot written under ATTEMPTS_LOCAL_ROOT/result.json */
export type DemoSnapshot = {
  schema: "artifacts-attempts.demo-snapshot/v1";
  writtenAt: string;
  result: LocalDemoResult;
  view: BoardTaskView;
};

export function toBoardTaskView(
  result: LocalDemoResult,
  opts?: { pendingApproval?: boolean; taskStatus?: LocalDemoResult["task"]["status"] }
): BoardTaskView {
  const canarySlice = result.canary.versions.find((v) => v.label === "canary");
  const previousSlice = result.canary.versions.find((v) => v.label === "previous");
  const pendingApproval =
    opts?.pendingApproval ?? (result.approvalUsed && result.task.status !== "released");
  return {
    task: opts?.taskStatus ? { ...result.task, status: opts.taskStatus } : result.task,
    attempts: result.attempts,
    notes: result.notes,
    decision: result.decision,
    pendingApproval,
    arweaveId: result.arweaveId,
    canary: {
      mode: result.canary.mode,
      canaryPercent: canarySlice?.percentage ?? result.canaryPercent,
      previousPercent: previousSlice?.percentage ?? 100 - result.canaryPercent,
      rollbackTrigger: result.canary.rollbackTrigger,
      versionId: canarySlice?.versionId ?? "",
    },
  };
}

export function snapshotPath(root: string): string {
  return join(root, "result.json");
}

export function writeDemoSnapshot(root: string, result: LocalDemoResult, view?: BoardTaskView): string {
  const path = snapshotPath(root);
  const snap: DemoSnapshot = {
    schema: "artifacts-attempts.demo-snapshot/v1",
    writtenAt: new Date().toISOString(),
    result,
    view: view ?? toBoardTaskView(result),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(snap, null, 2));
  return path;
}

export function readDemoSnapshot(root: string): DemoSnapshot {
  const path = snapshotPath(root);
  const snap = JSON.parse(readFileSync(path, "utf8")) as DemoSnapshot;
  if (snap.schema !== "artifacts-attempts.demo-snapshot/v1" || !snap.view?.task?.id) {
    throw new Error(`invalid demo snapshot at ${path}`);
  }
  return snap;
}

export async function postBoardView(
  api: string,
  view: BoardTaskView
): Promise<{ board: string; task: BoardTaskView["task"] }> {
  const res = await fetch(`${api}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: view.task.repo,
      prompt: view.task.prompt,
      view,
    }),
  });
  if (!res.ok) {
    throw new Error(`POST ${api}/tasks failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { task?: BoardTaskView["task"] };
  return {
    board: `${api}/?task=${view.task.id}`,
    task: body.task ?? view.task,
  };
}
