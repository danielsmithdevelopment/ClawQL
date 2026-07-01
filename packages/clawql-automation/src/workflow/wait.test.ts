import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArgoWorkflowObject } from "./k8s-client.js";
import {
  getWorkflowWaitPollSecondsDefault,
  getWorkflowWaitTimeoutSecondsDefault,
  isTerminalWorkflowPhase,
  waitForWorkflow,
} from "./wait.js";

function workflowWithPhase(phase: string): ArgoWorkflowObject {
  return {
    metadata: { name: "clawql-test", namespace: "clawql" },
    status: { phase },
    spec: { workflowTemplateRef: { name: "digest" } },
  };
}

describe("isTerminalWorkflowPhase", () => {
  it("returns true for Succeeded, Failed, and Error", () => {
    expect(isTerminalWorkflowPhase("Succeeded")).toBe(true);
    expect(isTerminalWorkflowPhase("Failed")).toBe(true);
    expect(isTerminalWorkflowPhase("Error")).toBe(true);
  });

  it("returns false for non-terminal phases", () => {
    expect(isTerminalWorkflowPhase("Running")).toBe(false);
    expect(isTerminalWorkflowPhase("Pending")).toBe(false);
    expect(isTerminalWorkflowPhase(undefined)).toBe(false);
  });
});

describe("wait env defaults", () => {
  afterEach(() => {
    delete process.env.CLAWQL_WORKFLOW_WAIT_TIMEOUT_SECONDS;
    delete process.env.CLAWQL_WORKFLOW_WAIT_POLL_SECONDS;
  });

  it("uses 600s timeout and 5s poll by default", () => {
    expect(getWorkflowWaitTimeoutSecondsDefault()).toBe(600);
    expect(getWorkflowWaitPollSecondsDefault()).toBe(5);
  });

  it("clamps env overrides", () => {
    process.env.CLAWQL_WORKFLOW_WAIT_TIMEOUT_SECONDS = "99999";
    process.env.CLAWQL_WORKFLOW_WAIT_POLL_SECONDS = "120";
    expect(getWorkflowWaitTimeoutSecondsDefault()).toBe(7200);
    expect(getWorkflowWaitPollSecondsDefault()).toBe(60);
  });

  it("falls back to defaults for non-numeric env", () => {
    process.env.CLAWQL_WORKFLOW_WAIT_TIMEOUT_SECONDS = "nope";
    process.env.CLAWQL_WORKFLOW_WAIT_POLL_SECONDS = "";
    expect(getWorkflowWaitTimeoutSecondsDefault()).toBe(600);
    expect(getWorkflowWaitPollSecondsDefault()).toBe(5);
  });
});

describe("waitForWorkflow", () => {
  it("returns on first poll when already terminal", async () => {
    const result = await waitForWorkflow({
      namespace: "clawql",
      name: "clawql-test",
      timeoutSeconds: 30,
      pollIntervalSeconds: 5,
      getWorkflow: async () => workflowWithPhase("Succeeded"),
    });
    expect(result.timedOut).toBe(false);
    expect(result.polls).toBe(1);
    expect(result.workflow.phase).toBe("Succeeded");
  });

  it("polls until terminal phase", async () => {
    let calls = 0;
    let nowMs = 0;
    const sleep = vi.fn(async () => {
      nowMs += 5000;
    });

    const result = await waitForWorkflow({
      namespace: "clawql",
      name: "clawql-test",
      timeoutSeconds: 30,
      pollIntervalSeconds: 5,
      getWorkflow: async () => {
        calls++;
        return workflowWithPhase(calls < 2 ? "Running" : "Succeeded");
      },
      sleep,
      now: () => nowMs,
    });

    expect(result.timedOut).toBe(false);
    expect(result.polls).toBe(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it("times out when phase stays non-terminal", async () => {
    let nowMs = 0;
    const sleep = vi.fn(async () => {
      nowMs += 5000;
    });

    const result = await waitForWorkflow({
      namespace: "clawql",
      name: "clawql-test",
      timeoutSeconds: 10,
      pollIntervalSeconds: 5,
      getWorkflow: async () => workflowWithPhase("Running"),
      sleep,
      now: () => nowMs,
    });

    expect(result.timedOut).toBe(true);
    expect(result.workflow.phase).toBe("Running");
    expect(result.polls).toBeGreaterThanOrEqual(2);
  });

  it("strips nodes when includeNodes is false", async () => {
    const wf: ArgoWorkflowObject = {
      ...workflowWithPhase("Succeeded"),
      status: {
        phase: "Succeeded",
        nodes: {
          "1": {
            displayName: "step",
            phase: "Succeeded",
            type: "Pod",
            podName: "pod-1",
          },
        },
      },
    };

    const result = await waitForWorkflow({
      namespace: "clawql",
      name: "clawql-test",
      timeoutSeconds: 5,
      pollIntervalSeconds: 1,
      includeNodes: false,
      getWorkflow: async () => wf,
    });

    expect(result.workflow.nodes).toBeUndefined();
  });
});
