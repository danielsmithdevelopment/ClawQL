import { afterEach, describe, expect, it, vi } from "vitest";
import { workflowTerminalNotifyEnabled } from "./env.js";

const executeNotifySlackCore = vi.fn(async (_params: { channel: string; text: string }) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }],
}));

vi.mock("../notify/notify.js", () => ({
  executeNotifySlackCore: (params: { channel: string; text: string }) =>
    executeNotifySlackCore(params),
}));

describe("maybeNotifyWorkflowTerminal", () => {
  afterEach(() => {
    delete process.env.CLAWQL_WORKFLOW_NOTIFY_ON_TERMINAL;
    delete process.env.CLAWQL_WORKFLOW_NOTIFY_CHANNEL;
    executeNotifySlackCore.mockClear();
  });

  it("no-ops when notify env is off", async () => {
    const { maybeNotifyWorkflowTerminal } = await import("./workflow-notify.js");
    await maybeNotifyWorkflowTerminal({
      namespace: "clawql",
      name: "clawql-abc",
      workflow: { namespace: "clawql", name: "clawql-abc", phase: "Succeeded" },
      timedOut: false,
      waitedSeconds: 12,
      polls: 3,
    });
    expect(executeNotifySlackCore).not.toHaveBeenCalled();
  });

  it("posts Slack when enabled with channel", async () => {
    process.env.CLAWQL_WORKFLOW_NOTIFY_ON_TERMINAL = "1";
    process.env.CLAWQL_WORKFLOW_NOTIFY_CHANNEL = "CWORKFLOW";
    const { maybeNotifyWorkflowTerminal } = await import("./workflow-notify.js");
    await maybeNotifyWorkflowTerminal({
      namespace: "clawql",
      name: "clawql-abc",
      workflow: {
        namespace: "clawql",
        name: "clawql-abc",
        phase: "Succeeded",
        template_ref: { kind: "WorkflowTemplate", name: "digest", namespace: "clawql" },
      },
      timedOut: false,
      waitedSeconds: 12,
      polls: 3,
    });
    expect(executeNotifySlackCore).toHaveBeenCalledOnce();
    expect(executeNotifySlackCore.mock.calls[0]?.[0]).toMatchObject({
      channel: "CWORKFLOW",
      text: expect.stringContaining("Workflow SUCCEEDED"),
    });
  });

  it("reports TIMEOUT in message when timed out", async () => {
    process.env.CLAWQL_WORKFLOW_NOTIFY_ON_TERMINAL = "1";
    process.env.CLAWQL_WORKFLOW_NOTIFY_CHANNEL = "CWORKFLOW";
    const { maybeNotifyWorkflowTerminal } = await import("./workflow-notify.js");
    await maybeNotifyWorkflowTerminal({
      namespace: "clawql",
      name: "clawql-abc",
      workflow: { namespace: "clawql", name: "clawql-abc", phase: "Running" },
      timedOut: true,
      waitedSeconds: 600,
      polls: 120,
    });
    expect(executeNotifySlackCore.mock.calls[0]?.[0]?.text).toContain("Workflow TIMEOUT");
  });
});

describe("workflowTerminalNotifyEnabled", () => {
  afterEach(() => {
    delete process.env.CLAWQL_WORKFLOW_NOTIFY_ON_TERMINAL;
  });

  it("reads truthy env", () => {
    process.env.CLAWQL_WORKFLOW_NOTIFY_ON_TERMINAL = "yes";
    expect(workflowTerminalNotifyEnabled()).toBe(true);
  });
});
