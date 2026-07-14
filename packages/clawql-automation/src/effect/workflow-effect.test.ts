import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { executeWorkflowToolCoreEffect } from "./workflow-effect.js";
import { waitForWorkflowEffect } from "../workflow/wait.js";
import type { ArgoWorkflowObject } from "../workflow/k8s-client.js";

describe("executeWorkflowToolCoreEffect", () => {
  afterEach(() => {
    delete process.env.CLAWQL_ENABLE_WORKFLOW;
    delete process.env.CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST;
  });

  it("returns soft disabled JSON without nested Layer provision", async () => {
    delete process.env.CLAWQL_ENABLE_WORKFLOW;
    const result = await Effect.runPromise(
      executeWorkflowToolCoreEffect({
        operation: "list",
        namespace: "clawql",
      })
    );
    const body = JSON.parse(result.content[0]!.text) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not enabled/i);
  });
});

describe("waitForWorkflowEffect", () => {
  function workflowWithPhase(phase: string): ArgoWorkflowObject {
    return {
      metadata: { name: "clawql-test", namespace: "clawql" },
      status: { phase },
      spec: { workflowTemplateRef: { name: "digest" } },
    };
  }

  it("stages poll loop until terminal phase with Effect.sleep injectable", async () => {
    let calls = 0;
    let nowMs = 0;
    const result = await Effect.runPromise(
      waitForWorkflowEffect({
        namespace: "clawql",
        name: "clawql-test",
        timeoutSeconds: 30,
        pollIntervalSeconds: 5,
        getWorkflow: async () => {
          calls++;
          return workflowWithPhase(calls === 1 ? "Running" : "Succeeded");
        },
        sleep: async () => {
          nowMs += 5000;
        },
        now: () => nowMs,
      })
    );
    expect(result.timedOut).toBe(false);
    expect(result.polls).toBe(2);
    expect(result.workflow.phase).toBe("Succeeded");
  });
});
