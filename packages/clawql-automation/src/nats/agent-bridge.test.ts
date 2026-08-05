import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDocumentEvent } from "./envelope.js";
import { handleDocumentEventForAgentBridge } from "./agent-bridge.js";

describe("handleDocumentEventForAgentBridge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ingests memory on pipeline.completed", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const mcp = {
      callTool: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { ok: true, text: "{}" };
      },
    };
    const envelope = buildDocumentEvent("pipeline.completed", "test", {
      correlation_id: "c1",
      payload: { document_path: "IDP/inbox/w2.pdf" },
    });
    const result = await handleDocumentEventForAgentBridge(envelope, mcp);
    expect(result.ok).toBe(true);
    expect(result.actions).toContain("memory_ingest");
    expect(calls[0]?.name).toBe("memory_ingest");
    expect(calls[0]?.args.sessionId).toBe("c1");
  });

  it("notifies Slack on pipeline.failed when channel configured", async () => {
    vi.stubEnv("CLAWQL_NATS_AGENT_BRIDGE_NOTIFY_CHANNEL", "C123");
    const calls: string[] = [];
    const mcp = {
      callTool: async (name: string) => {
        calls.push(name);
        return { ok: true, text: "{}" };
      },
    };
    const envelope = buildDocumentEvent("pipeline.failed", "test", {
      correlation_id: "c2",
      payload: { document_path: "IDP/inbox/w2.pdf", error: "stirling down" },
    });
    const result = await handleDocumentEventForAgentBridge(envelope, mcp);
    expect(result.ok).toBe(true);
    expect(calls).toContain("memory_ingest");
    expect(calls).toContain("notify");
  });

  it("ingests ConeShare viewer events", async () => {
    const mcp = {
      callTool: async () => ({ ok: true, text: "{}" }),
    };
    const envelope = buildDocumentEvent("coneshare.viewer", "test", {
      payload: { event_type: "viewer.opened", share_link_id: "s1" },
    });
    const result = await handleDocumentEventForAgentBridge(envelope, mcp);
    expect(result.ok).toBe(true);
    expect(result.actions).toContain("memory_ingest");
  });

  it("ignores hop events", async () => {
    const mcp = {
      callTool: async () => {
        throw new Error("should not call");
      },
    };
    const envelope = buildDocumentEvent("pipeline.hop", "test", {
      payload: { hop: { index: 0 } },
    });
    const result = await handleDocumentEventForAgentBridge(envelope, mcp);
    expect(result.actions).toContain("ignored");
  });
});
