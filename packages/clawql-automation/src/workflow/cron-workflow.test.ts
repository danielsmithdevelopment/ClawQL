import { describe, expect, it } from "vitest";
import { buildSubmitCronWorkflowBody, mapCronWorkflowToSummary } from "./cron-workflow.js";

describe("buildSubmitCronWorkflowBody", () => {
  it("builds CronWorkflow from template ref", () => {
    const body = buildSubmitCronWorkflowBody({
      name: "vault-digest-daily",
      namespace: "clawql",
      schedule: "0 6 * * *",
      templateRef: {
        kind: "WorkflowTemplate",
        name: "clawql-vault-daily-digest",
        namespace: "clawql",
      },
      parameters: { hours_back: "24" },
      correlationId: "digest-cron",
    });
    expect(body).toMatchObject({
      kind: "CronWorkflow",
      metadata: { name: "vault-digest-daily", namespace: "clawql" },
      spec: {
        schedule: "0 6 * * *",
        timezone: "UTC",
        workflowSpec: {
          workflowTemplateRef: { name: "clawql-vault-daily-digest" },
        },
      },
    });
  });
});

describe("mapCronWorkflowToSummary", () => {
  it("maps schedule and suspended flag", () => {
    const summary = mapCronWorkflowToSummary(
      {
        metadata: { name: "vault-digest-daily", namespace: "clawql" },
        spec: {
          schedule: "0 6 * * *",
          suspend: true,
          workflowSpec: { workflowTemplateRef: { name: "digest" } },
        },
        status: { lastScheduledTime: "2026-06-30T06:00:00Z", active: [{ name: "wf-1" }] },
      },
      "clawql"
    );
    expect(summary.schedule).toBe("0 6 * * *");
    expect(summary.suspended).toBe(true);
    expect(summary.active_workflows).toEqual(["wf-1"]);
  });
});
