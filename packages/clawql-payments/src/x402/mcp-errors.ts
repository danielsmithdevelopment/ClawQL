import type { X402PaymentRequired } from "./types.js";
import { isMppEnabled } from "../mpp/config.js";
import { offersFromX402Required } from "../mpp/offers.js";
import { enrichMcpToolResultWithMpp, type MppMcpToolResult } from "../mpp/mcp.js";

export type X402McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
  _meta?: Record<string, unknown>;
};

export class X402McpPaymentRequiredError extends Error {
  readonly name = "X402McpPaymentRequiredError";

  constructor(public readonly body: X402PaymentRequired) {
    super("x402 payment required");
  }

  toToolResult(env: NodeJS.ProcessEnv = process.env): MppMcpToolResult {
    const base: MppMcpToolResult = {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "payment_required",
              httpStatus: 402,
              x402: this.body,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
      _meta: {
        "clawql/x402": this.body,
        "clawql/httpStatus": 402,
      },
    };

    if (!isMppEnabled(env)) {
      return base;
    }

    const resource = this.body.resource.url ?? "mcp://tool";
    return enrichMcpToolResultWithMpp(base, {
      offers: offersFromX402Required(
        this.body,
        Boolean(env.STRIPE_SECRET_KEY?.trim())
      ),
      resource,
      x402Body: this.body,
    });
  }
}

export class X402McpPaymentDeniedError extends Error {
  readonly name = "X402McpPaymentDeniedError";

  constructor(
    public readonly reason: string,
    public readonly resource: string
  ) {
    super(reason);
  }

  toToolResult(): X402McpToolResult {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "payment_denied",
              httpStatus: 402,
              reason: this.reason,
              resource: this.resource,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
      _meta: {
        "clawql/httpStatus": 402,
        "clawql/x402Reason": this.reason,
        "clawql/x402Resource": this.resource,
      },
    };
  }
}

export function isX402McpPaymentError(
  err: unknown
): err is X402McpPaymentRequiredError | X402McpPaymentDeniedError {
  return err instanceof X402McpPaymentRequiredError || err instanceof X402McpPaymentDeniedError;
}
