import type { Attempt, Task } from "@artifacts-attempts/shared";
import type { EvidenceNote } from "@artifacts-attempts/notes";
import type { DecisionResponse } from "@artifacts-attempts/shared";

/** Board-facing canary summary (dry-run or live gradual deploy). */
export type CanaryView = {
  mode: "dry-run" | "live";
  canaryPercent: number;
  rollbackTrigger: string;
  versionId: string;
  previousPercent: number;
};

export type TaskView = {
  task: Task;
  attempts: Attempt[];
  notes: EvidenceNote[];
  decision?: DecisionResponse;
  pendingApproval?: boolean;
  autoMerge?: boolean;
  trustReason?: string;
  canary?: CanaryView;
  arweaveId?: string;
};

const store = new Map<string, TaskView>();
const listeners = new Map<string, Set<(data: TaskView) => void>>();

export function putTaskView(view: TaskView): void {
  store.set(view.task.id, view);
  for (const fn of listeners.get(view.task.id) ?? []) fn(view);
}

export function getTaskView(id: string): TaskView | undefined {
  return store.get(id);
}

export function subscribe(id: string, fn: (data: TaskView) => void): () => void {
  const set = listeners.get(id) ?? new Set();
  set.add(fn);
  listeners.set(id, set);
  return () => set.delete(fn);
}
