import { afterEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { X402McpPaymentRequiredError } from "clawql-payments/x402";
import { handleAuditToolInput, resetClawqlAuditBufferForTests } from "./mcp/clawql-audit.js";
import { runMcpProxyBeforeCallTool } from "./composition/clawql-api-adapters.js";
import { wrapRegisteredMcpToolHandler } from "./mcp/mcp-tool-wrap.js";

vi.mock("./composition/clawql-api-adapters.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./composition/clawql-api-adapters.js")>();
  return {
    ...actual,
    runMcpProxyBeforeCallTool: vi.fn(async () => undefined),
  };
});

vi.mock("clawql-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("clawql-api")>();
  return {
    ...actual,
    openAppaEnabled: vi.fn(() => false),
    openAppaBeforeToolCallEffect: vi.fn(),
    openAppaAfterToolResultEffect: vi.fn(),
    evaluateNativeToolGate: vi.fn(async () => null),
  };
});

import {
  evaluateNativeToolGate,
  openAppaAfterToolResultEffect,
  openAppaBeforeToolCallEffect,
  openAppaEnabled,
} from "clawql-api";

describe("wrapRegisteredMcpToolHandler", () => {
  afterEach(() => {
    resetClawqlAuditBufferForTests();
    vi.mocked(openAppaEnabled).mockReturnValue(false);
    vi.mocked(evaluateNativeToolGate).mockResolvedValue(null);
  });

  it("returns x402 payment required tool result instead of throwing", async () => {
    const body = {
      x402Version: 2,
      resource: { url: "mcp://tool/search" },
      accepts: [],
    };
    vi.mocked(runMcpProxyBeforeCallTool).mockRejectedValueOnce(
      new X402McpPaymentRequiredError(body)
    );

    const wrapped = wrapRegisteredMcpToolHandler("search", async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    const result = await wrapped({ query: "x", limit: 1 });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("payment_required");
  });

  it("returns Panguard policy block text instead of a generic throw", async () => {
    vi.mocked(runMcpProxyBeforeCallTool).mockRejectedValueOnce({
      _tag: "ClawQLError",
      reason: "Panguard policy blocked tool: execute",
    });

    const wrapped = wrapRegisteredMcpToolHandler("execute", async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    const result = await wrapped({ operationId: "x", dry_run: true });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Panguard policy blocked tool: execute");
  });

  it("returns OpenAPPA Layer 5 hard block after Panguard allows", async () => {
    vi.mocked(runMcpProxyBeforeCallTool).mockResolvedValueOnce(undefined);
    vi.mocked(openAppaEnabled).mockReturnValue(true);
    vi.mocked(openAppaBeforeToolCallEffect).mockReturnValueOnce(
      Effect.succeed({
        allow: false,
        status: "blocked",
        reason: "OpenAPPA policy blocked tool: undeclared",
        decision: {
          protocol: 1,
          decision: "refuse",
          class: "undeclared_tool",
        },
      })
    );

    const handler = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "should-not-run" }],
    }));
    const wrapped = wrapRegisteredMcpToolHandler("sandbox_exec", handler);

    const result = await wrapped({});
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("openappa_layer5");
    expect(evaluateNativeToolGate).not.toHaveBeenCalled();
  });

  it("coalesces OpenAPPA mandate + native park into one approval", async () => {
    vi.mocked(runMcpProxyBeforeCallTool).mockResolvedValueOnce(undefined);
    vi.mocked(openAppaEnabled).mockReturnValue(true);
    vi.mocked(openAppaBeforeToolCallEffect).mockReturnValueOnce(
      Effect.succeed({
        allow: false,
        status: "mandate_required",
        reason: "OpenAPPA requires attention: human-approval",
        decision: { protocol: 1, decision: "deny_call" },
      })
    );
    vi.mocked(evaluateNativeToolGate).mockResolvedValueOnce({
      ok: false,
      status: "mandate_required",
      reason: "park destructive notify",
      toolName: "notify",
      mechanism: "park_destructive_write",
      executionId: "exec-coalesce",
    });

    const handler = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "should-not-run" }],
    }));
    const wrapped = wrapRegisteredMcpToolHandler("notify", handler);
    const result = await wrapped({ destination: "external" });
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "{}") as {
      mechanism: string;
      status: string;
      layers: unknown[];
      executionId?: string;
    };
    expect(body.mechanism).toBe("composed_mandate");
    expect(body.status).toBe("mandate_required");
    expect(body.layers).toHaveLength(2);
    expect(body.executionId).toBe("exec-coalesce");
    expect(openAppaAfterToolResultEffect).not.toHaveBeenCalled();
  });

  it("OpenAPPA allow + native IFC block → IFC wins", async () => {
    vi.mocked(runMcpProxyBeforeCallTool).mockResolvedValueOnce(undefined);
    vi.mocked(openAppaEnabled).mockReturnValue(true);
    vi.mocked(openAppaBeforeToolCallEffect).mockReturnValueOnce(
      Effect.succeed({
        allow: true,
        decision: { protocol: 1, decision: "allow_call" },
      })
    );
    vi.mocked(evaluateNativeToolGate).mockResolvedValueOnce({
      ok: false,
      status: "blocked",
      reason: "untrusted may not flow to external",
      toolName: "notify",
      mechanism: "untrusted_read_taint",
    });

    const handler = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "nope" }],
    }));
    const wrapped = wrapRegisteredMcpToolHandler("notify", handler);
    const result = await wrapped({ destination: "external" });
    expect(handler).not.toHaveBeenCalled();
    const body = JSON.parse(result.content[0]?.text ?? "{}") as { mechanism: string };
    expect(body.mechanism).toBe("session_ifc");
  });

  it("surfaces CAPABILITY_WRITE_INTERCEPTED reason when Error.message is empty", async () => {
    vi.mocked(runMcpProxyBeforeCallTool).mockRejectedValueOnce({
      _tag: "ClawQLError",
      reason:
        "CAPABILITY_WRITE_INTERCEPTED: tool outside three-bucket catalog (not in session_catalog∩S and no PROMOTION_ACCEPTED skillId with scope ⊆ S)",
      message: "",
    });

    const wrapped = wrapRegisteredMcpToolHandler("execute", async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    const result = await wrapped({ operationId: "listPets", args: {} });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("CAPABILITY_WRITE_INTERCEPTED");
  });

  it("auto-appends mcp_tool audit after a successful search call", async () => {
    const wrapped = wrapRegisteredMcpToolHandler("search", async () => ({
      content: [{ type: "text" as const, text: "hits" }],
    }));
    await wrapped({ query: "pets", limit: 1 });
    const listed = await handleAuditToolInput({ operation: "list", limit: 10 });
    const body = JSON.parse(listed.content[0].text) as {
      entries: { category: string; action: string; summary: string }[];
    };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.category).toBe("mcp_tool");
    expect(body.entries[0]?.action).toBe("search");
    expect(body.entries[0]?.summary).toContain("query=pets");
  });

  it("does not auto-append when the wrapped tool is audit", async () => {
    const wrapped = wrapRegisteredMcpToolHandler("audit", handleAuditToolInput);
    await wrapped({
      operation: "append",
      category: "manual",
      action: "note",
      summary: "operator line",
    });
    const listed = await handleAuditToolInput({ operation: "list", limit: 10 });
    const body = JSON.parse(listed.content[0].text) as {
      entries: { category: string; action: string }[];
    };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.category).toBe("manual");
    expect(body.entries[0]?.action).toBe("note");
  });
});
