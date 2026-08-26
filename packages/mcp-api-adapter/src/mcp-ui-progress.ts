import { randomUUID } from "node:crypto";

export type ProgressEvent = {
  type: "progress" | "complete" | "error";
  message: string;
  percent?: number;
  resultHtml?: string;
  at: string;
};

export type ProgressJob = {
  id: string;
  toolName: string;
  createdAt: number;
  events: ProgressEvent[];
  done: boolean;
  listeners: Set<(event: ProgressEvent) => void>;
  /** Escaped HTML fragment for the final tool result (set on complete/error). */
  resultHtml?: string;
};

const jobs = new Map<string, ProgressJob>();
const MAX_JOBS = 200;
const TTL_MS = 30 * 60 * 1000;

function sweep(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > TTL_MS) jobs.delete(id);
  }
  while (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value;
    if (oldest) jobs.delete(oldest);
    else break;
  }
}

export function createProgressJob(toolName: string): ProgressJob {
  sweep();
  const job: ProgressJob = {
    id: randomUUID(),
    toolName,
    createdAt: Date.now(),
    events: [],
    done: false,
    listeners: new Set(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getProgressJob(id: string): ProgressJob | undefined {
  return jobs.get(id);
}

export function pushProgressEvent(job: ProgressJob, event: Omit<ProgressEvent, "at">): void {
  const full: ProgressEvent = { ...event, at: new Date().toISOString() };
  job.events.push(full);
  if (event.type === "complete" || event.type === "error") {
    job.done = true;
    if (event.resultHtml) job.resultHtml = event.resultHtml;
  }
  for (const listener of job.listeners) listener(full);
}

export function subscribeProgress(
  job: ProgressJob,
  listener: (event: ProgressEvent) => void
): () => void {
  job.listeners.add(listener);
  for (const event of job.events) listener(event);
  return () => {
    job.listeners.delete(listener);
  };
}

/** Tools that use SSE progress by default (known long-running). */
export const DEFAULT_LONG_RUNNING_TOOLS = new Set([
  "run_idp_pipeline",
  "ouroboros_run_evolutionary_loop",
  "ouroboros_create_seed_from_document",
]);

export function isLongRunningTool(toolName: string): boolean {
  return (
    DEFAULT_LONG_RUNNING_TOOLS.has(toolName) ||
    toolName.startsWith("ouroboros_") ||
    toolName === "run_idp_pipeline"
  );
}
