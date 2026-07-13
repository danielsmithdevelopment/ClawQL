import { describe, expect, it } from "vitest";
import {
  MppMcpJsonRpcPaymentRequiredError,
  MppMcpJsonRpcVerificationFailedError,
} from "./mcp-jsonrpc-errors.js";
import { MPP_MCP_PAYMENT_REQUIRED_CODE, MPP_MCP_VERIFICATION_FAILED_CODE } from "./types.js";

describe("MppMcpJsonRpcPaymentRequiredError", () => {
  it("emits JSON-RPC -32042 payload", () => {
    const err = new MppMcpJsonRpcPaymentRequiredError(
      {
        x402Version: 2,
        resource: { url: "mcp://tool/search" },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:84532",
            amount: "1000",
            asset: "0xasset",
            payTo: "0xpay",
          },
        ],
      },
      "tool:search",
      { CLAWQL_MPP_ENABLED: "1" }
    );
    const json = err.toJsonRpcError(7);
    expect(json.id).toBe(7);
    expect(json.error.code).toBe(MPP_MCP_PAYMENT_REQUIRED_CODE);
    expect(json.error.message).toBe("Payment Required");
  });
});

describe("MppMcpJsonRpcVerificationFailedError", () => {
  it("emits JSON-RPC -32043 payload", () => {
    const err = new MppMcpJsonRpcVerificationFailedError("bad credential", "tool:search");
    const json = err.toJsonRpcError("req-1");
    expect(json.error.code).toBe(MPP_MCP_VERIFICATION_FAILED_CODE);
    expect(json.error.data?.reason).toBe("bad credential");
  });
});
