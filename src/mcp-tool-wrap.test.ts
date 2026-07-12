import { describe, expect, it, vi } from "vitest";
import {
  X402McpPaymentRequiredError,
  runMcpX402BeforeCallTool,
} from "clawql-payments/x402";
import { wrapRegisteredMcpToolHandler } from "./mcp-tool-wrap.js";

vi.mock("clawql-payments/x402", async (importOriginal) => {
  const actual = await importOriginal<typeof import("clawql-payments/x402")>();
  return {
    ...actual,
    runMcpX402BeforeCallTool: vi.fn(async () => undefined),
    isX402McpPaymentError: actual.isX402McpPaymentError,
  };
});

describe("wrapRegisteredMcpToolHandler", () => {
  it("returns x402 payment required tool result instead of throwing", async () => {
    const body = {
      x402Version: 2,
      resource: { url: "mcp://tool/search" },
      accepts: [],
    };
    vi.mocked(runMcpX402BeforeCallTool).mockRejectedValueOnce(
      new X402McpPaymentRequiredError(body)
    );

    const wrapped = wrapRegisteredMcpToolHandler("search", async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    const result = await wrapped({ query: "x", limit: 1 });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("payment_required");
  });
});
