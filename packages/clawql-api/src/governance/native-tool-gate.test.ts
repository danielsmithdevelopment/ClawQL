import { afterEach, describe, expect, it } from "vitest";
import { clearAllSessionLabelsSync } from "../ifc/session-label-store.js";
import {
  accumulateNativeToolReadAfterSuccess,
  classifyNativeTool,
  gateNativeToolBeforeInvoke,
  taintSessionFromUntrustedChannel,
} from "./native-tool-gate.js";
import { NATIVE_TOOL_GOVERNANCE_MODULE_ID, resolveNativeToolPolicy } from "./native-tool-policy.js";

afterEach(() => {
  clearAllSessionLabelsSync();
  delete process.env.CLAWQL_ENABLE_SESSION_IFC;
  delete process.env.CLAWQL_OPERATION_RISK_ENFORCE;
  delete process.env.CLAWQL_SESSION_ID;
});

describe("native tool policy", () => {
  it("exports governance module id for CI wrap assertion", () => {
    expect(NATIVE_TOOL_GOVERNANCE_MODULE_ID).toMatch(/native-tool-governance/);
  });

  it("classifies memory_ingest as destructive and memory_recall as read", () => {
    expect(resolveNativeToolPolicy("memory_ingest").kind).toBe("destructive");
    expect(resolveNativeToolPolicy("memory_recall").kind).toBe("read");
    expect(classifyNativeTool("execute").executePath).toBe(true);
  });

  it("fails closed: unknown tools are destructive", () => {
    expect(resolveNativeToolPolicy("brand_new_native_tool").kind).toBe("destructive");
  });
});

describe("native tool gate", () => {
  it("parks memory_ingest when risk enforce is on (product default)", async () => {
    process.env.CLAWQL_OPERATION_RISK_ENFORCE = "1";
    process.env.CLAWQL_ENABLE_SESSION_IFC = "1";
    process.env.CLAWQL_SESSION_ID = "gate-park";
    const block = await gateNativeToolBeforeInvoke({
      toolName: "memory_ingest",
      args: { title: "x", insights: "y" },
      sessionId: "gate-park",
    });
    expect(block).not.toBeNull();
    expect(block?.isError).toBe(true);
    const body = JSON.parse((block as { content: { text: string }[] }).content[0]!.text);
    expect(body.status).toBe("mandate_required");
    expect(body.mechanism).toBe("park_destructive_write");
  });

  it("blocks memory_ingest after untrusted channel taint even when park opt-out", async () => {
    process.env.CLAWQL_OPERATION_RISK_ENFORCE = "0";
    process.env.CLAWQL_ENABLE_SESSION_IFC = "1";
    process.env.CLAWQL_SESSION_ID = "gate-taint";
    taintSessionFromUntrustedChannel("email", "gate-taint");
    const block = await gateNativeToolBeforeInvoke({
      toolName: "memory_ingest",
      args: { title: "OVERRIDE", insights: "99.99" },
      sessionId: "gate-taint",
    });
    expect(block).not.toBeNull();
    const body = JSON.parse((block as { content: { text: string }[] }).content[0]!.text);
    expect(body.status).toBe("blocked");
    expect(["untrusted_read_taint", "data_flow"]).toContain(body.mechanism);
  });

  it("allows memory_recall and accumulates labels", () => {
    process.env.CLAWQL_ENABLE_SESSION_IFC = "1";
    process.env.CLAWQL_SESSION_ID = "gate-read";
    accumulateNativeToolReadAfterSuccess({
      toolName: "memory_recall",
      success: true,
      sessionId: "gate-read",
    });
    // no throw — read path is open
    expect(classifyNativeTool("memory_recall").kind).toBe("read");
  });

  it("skips execute-path tools", async () => {
    process.env.CLAWQL_OPERATION_RISK_ENFORCE = "1";
    const block = await gateNativeToolBeforeInvoke({
      toolName: "execute",
      args: { operationId: "x" },
    });
    expect(block).toBeNull();
  });
});
