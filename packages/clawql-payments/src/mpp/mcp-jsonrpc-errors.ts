import type { X402PaymentRequired } from "../x402/types.js";
import {
  buildMppMcpJsonRpcError,
  enrichMcpToolResultWithMpp,
  type MppMcpToolResult,
} from "./mcp.js";
import { isMppEnabled } from "./config.js";
import { offersFromX402Required } from "./offers.js";
import { MPP_MCP_PAYMENT_REQUIRED_CODE, MPP_MCP_VERIFICATION_FAILED_CODE } from "./types.js";

export type MppMcpJsonRpcErrorBody = {
  code: number;
  message: string;
  data?: Record<string, unknown>;
};

/** JSON-RPC -32042 payment required (opt-in via CLAWQL_MPP_MCP_JSONRPC=1). */
export class MppMcpJsonRpcPaymentRequiredError extends Error {
  readonly name = "MppMcpJsonRpcPaymentRequiredError";

  constructor(
    public readonly body: X402PaymentRequired,
    public readonly resource: string,
    public readonly env: NodeJS.ProcessEnv = process.env
  ) {
    super("MPP payment required");
  }

  toJsonRpcError(id: string | number | null = null): {
    jsonrpc: "2.0";
    id: string | number | null;
    error: MppMcpJsonRpcErrorBody;
  } {
    const offers = offersFromX402Required(this.body, Boolean(this.env.STRIPE_SECRET_KEY?.trim()));
    const jsonRpcError = buildMppMcpJsonRpcError({
      offers,
      resource: this.resource,
      x402Body: this.body,
    });
    return {
      jsonrpc: "2.0",
      id,
      error: jsonRpcError,
    };
  }

  toToolResult(): MppMcpToolResult {
    const offers = offersFromX402Required(this.body, Boolean(this.env.STRIPE_SECRET_KEY?.trim()));
    const base: MppMcpToolResult = {
      content: [
        {
          type: "text",
          text: JSON.stringify(this.toJsonRpcError().error, null, 2),
        },
      ],
      isError: true,
      _meta: {
        "clawql/mppJsonRpc": true,
        "clawql/httpStatus": 402,
      },
    };
    if (!isMppEnabled(this.env)) return base;
    return enrichMcpToolResultWithMpp(base, {
      offers,
      resource: this.resource,
      x402Body: this.body,
    });
  }
}

/** JSON-RPC -32043 verification failed (opt-in via CLAWQL_MPP_MCP_JSONRPC=1). */
export class MppMcpJsonRpcVerificationFailedError extends Error {
  readonly name = "MppMcpJsonRpcVerificationFailedError";

  constructor(
    public readonly reason: string,
    public readonly resource: string,
    public readonly code: number = MPP_MCP_VERIFICATION_FAILED_CODE
  ) {
    super(reason);
  }

  toJsonRpcError(id: string | number | null = null): {
    jsonrpc: "2.0";
    id: string | number | null;
    error: MppMcpJsonRpcErrorBody;
  } {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: this.code,
        message: "Payment verification failed",
        data: {
          reason: this.reason,
          resource: this.resource,
        },
      },
    };
  }

  toToolResult(): MppMcpToolResult {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(this.toJsonRpcError().error, null, 2),
        },
      ],
      isError: true,
      _meta: {
        "clawql/mppJsonRpc": true,
        "clawql/httpStatus": 402,
        "clawql/mppVerificationCode": this.code,
      },
    };
  }
}

export function isMppMcpJsonRpcPaymentError(
  err: unknown
): err is MppMcpJsonRpcPaymentRequiredError | MppMcpJsonRpcVerificationFailedError {
  return (
    err instanceof MppMcpJsonRpcPaymentRequiredError ||
    err instanceof MppMcpJsonRpcVerificationFailedError
  );
}

export { MPP_MCP_PAYMENT_REQUIRED_CODE, MPP_MCP_VERIFICATION_FAILED_CODE };
