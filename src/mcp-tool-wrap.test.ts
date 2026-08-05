import { describe, expect, it, vi } from "vitest";
import { X402McpPaymentRequiredError } from "clawql-payments/x402";
import { runMcpProxyBeforeCallTool } from "./clawql-api-adapters.js";
import { wrapRegisteredMcpToolHandler } from "./mcp-tool-wrap.js";

vi.mock("./clawql-api-adapters.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clawql-api-adapters.js")>();
  return {
    ...actual,
    runMcpProxyBeforeCallTool: vi.fn(async () => undefined),
  };
});

describe("wrapRegisteredMcpToolHandler", () => {
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
});
