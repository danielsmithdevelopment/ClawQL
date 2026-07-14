/**
 * Poll Argo Workflow status until terminal phase or timeout (`workflow` wait operation).
 * Native Effect.gen available via {@link waitForWorkflowEffect}; Promise façade preserved.
 */

import { Duration, Effect } from "effect";
import { mapWorkflowToSummary, type WorkflowSummary } from "./argo-mapper.js";
import type { ArgoWorkflowObject } from "./k8s-client.js";
import { AutomationError } from "../effect/automation-errors.js";
import { automationFromPromise } from "../effect/automation-effect-utils.js";

export const TERMINAL_WORKFLOW_PHASES = ["Succeeded", "Failed", "Error"] as const;

export type TerminalWorkflowPhase = (typeof TERMINAL_WORKFLOW_PHASES)[number];

export function isTerminalWorkflowPhase(phase: string | undefined): phase is TerminalWorkflowPhase {
  if (!phase) return false;
  return (TERMINAL_WORKFLOW_PHASES as readonly string[]).includes(phase);
}

export function getWorkflowWaitTimeoutSecondsDefault(): number {
  const raw = process.env.CLAWQL_WORKFLOW_WAIT_TIMEOUT_SECONDS?.trim();
  if (!raw) return 600;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 600;
  return Math.min(Math.max(parsed, 1), 7200);
}

export function getWorkflowWaitPollSecondsDefault(): number {
  const raw = process.env.CLAWQL_WORKFLOW_WAIT_POLL_SECONDS?.trim();
  if (!raw) return 5;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(parsed, 1), 60);
}

export type WaitForWorkflowOptions = {
  namespace: string;
  name: string;
  timeoutSeconds: number;
  pollIntervalSeconds: number;
  includeNodes?: boolean;
  getWorkflow: (namespace: string, name: string) => Promise<ArgoWorkflowObject>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type WaitForWorkflowResult = {
  workflow: WorkflowSummary;
  waitedMs: number;
  timedOut: boolean;
  polls: number;
};

/**
 * Native Effect.gen wait loop — K8s get behind {@link automationFromPromise},
 * poll delay via {@link Effect.sleep} (or injectable Promise sleep for tests).
 */
export function waitForWorkflowEffect(
  options: WaitForWorkflowOptions
): Effect.Effect<WaitForWorkflowResult, AutomationError> {
  return Effect.gen(function* () {
    const now = options.now ?? (() => Date.now());
    const deadline = now() + options.timeoutSeconds * 1000;
    let polls = 0;
    let waitedMs = 0;

    while (true) {
      polls++;
      const started = now();
      const wf = yield* automationFromPromise(() =>
        options.getWorkflow(options.namespace, options.name)
      );
      const summary = mapWorkflowToSummary(wf, options.namespace);
      if (options.includeNodes === false) {
        delete summary.nodes;
      }

      if (isTerminalWorkflowPhase(summary.phase)) {
        waitedMs += now() - started;
        return { workflow: summary, waitedMs, timedOut: false, polls };
      }

      const remaining = deadline - now();
      if (remaining <= 0) {
        waitedMs += now() - started;
        return {
          workflow: summary,
          waitedMs,
          timedOut: true,
          polls,
        };
      }

      const delayMs = Math.min(options.pollIntervalSeconds * 1000, remaining);
      if (options.sleep) {
        yield* automationFromPromise(() => options.sleep!(delayMs));
      } else {
        yield* Effect.sleep(Duration.millis(delayMs));
      }
      waitedMs += now() - started;
    }
  });
}

/** Promise façade over {@link waitForWorkflowEffect}. */
export async function waitForWorkflow(
  options: WaitForWorkflowOptions
): Promise<WaitForWorkflowResult> {
  return Effect.runPromise(waitForWorkflowEffect(options));
}
