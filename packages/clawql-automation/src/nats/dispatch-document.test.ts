import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDocumentEvent } from "./envelope.js";
import { dispatchConeshareViewerEvent, dispatchDocumentInboxEvent } from "./dispatch-document.js";

const { resumeMock } = vi.hoisted(() => ({
  resumeMock: vi.fn(async (_hitl?: unknown) => ({
    attempted: true,
    ok: true,
    resumed_nodes: ["hitl-review"],
    workflow_level_resumed: false,
  })),
}));

vi.mock("./env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./env.js")>();
  return {
    ...actual,
    natsConsumerIdpPipelineEnabled: () => true,
    natsConsumerConeshareFollowupEnabled: () => true,
    natsConsumerResumeWorkflowEnabled: () => true,
    natsConeshareNotifyChannel: () => undefined,
  };
});

vi.mock("../workflow/env.js", () => ({
  workflowToolEnabled: () => true,
}));

vi.mock("../workflow/suspend-resume.js", () => ({
  parseHitlWorkflowRef: (hitl: unknown) => {
    const h = hitl as { workflow?: { namespace: string; name: string } };
    if (h?.workflow?.namespace && h?.workflow?.name) return h.workflow;
    return undefined;
  },
  resumeWorkflowFromHitlRef: resumeMock,
}));

vi.mock("./publish-hooks.js", () => ({
  publishDocumentPipelineHopEvent: vi.fn(async () => true),
  publishDocumentPipelineTerminalEvent: vi.fn(async () => true),
}));

describe("dispatchDocumentInboxEvent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires document_path", async () => {
    const envelope = buildDocumentEvent("inbox.arrived", "test", {
      payload: {},
    });
    const result = await dispatchDocumentInboxEvent(envelope);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/document_path/i);
  });

  it("runs pipeline via HTTP when documents plugin deps are unavailable", async () => {
    vi.stubEnv("CLAWQL_MCP_INTERNAL_URL", "http://mcp.internal:8080");
    const fetchMock = vi.fn(async () => Response.json({ ok: true, completed_through: 3 }));
    vi.stubGlobal("fetch", fetchMock);

    const envelope = buildDocumentEvent("inbox.arrived", "nextcloud-webhook", {
      correlation_id: "corr-1",
      payload: { document_path: "IDP/inbox/w2.pdf" },
    });
    const result = await dispatchDocumentInboxEvent(envelope);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain("/idp/pipeline/run");
    expect(JSON.parse(String(call[1].body))).toMatchObject({
      document_path: "IDP/inbox/w2.pdf",
      correlation_id: "corr-1",
    });
  });
});

describe("dispatchConeshareViewerEvent", () => {
  afterEach(() => {
    resumeMock.mockClear();
  });

  it("resumes workflow from clawql_share payload", async () => {
    const envelope = buildDocumentEvent("coneshare.viewer", "coneshare-webhook", {
      correlation_id: "share-1",
      payload: {
        event_type: "viewer.opened",
        clawql_share: { workflow: { namespace: "clawql", name: "wf-demo" } },
      },
    });
    const result = await dispatchConeshareViewerEvent(envelope);
    expect(result.ok).toBe(true);
    expect(resumeMock).toHaveBeenCalled();
  });

  it("acks viewer events without workflow ref", async () => {
    const envelope = buildDocumentEvent("coneshare.viewer", "coneshare-webhook", {
      payload: { event_type: "viewer.opened" },
    });
    const result = await dispatchConeshareViewerEvent(envelope);
    expect(result.ok).toBe(true);
    expect(resumeMock).not.toHaveBeenCalled();
  });
});
