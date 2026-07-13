import { Effect } from "effect";
import { getMcpX402Context } from "./mcp-context.js";
import { isMppMcpJsonRpcEnabled } from "../mpp/mcp-jsonrpc.js";
import {
  MppMcpJsonRpcPaymentRequiredError,
  MppMcpJsonRpcVerificationFailedError,
} from "../mpp/mcp-jsonrpc-errors.js";
import { X402McpPaymentDeniedError, X402McpPaymentRequiredError } from "./mcp-errors.js";
import { isX402EnforcementActive } from "./x402-runtime-config-service.js";
import { X402EnforcementService } from "./x402-enforcement-service.js";
import { paymentsServicesLiveLayer } from "../runtime/payments-effect-runtime.js";
import { mcpToolResourceName, type RunMcpX402BeforeCallToolOptions } from "./mcp-enforce.js";

export { mcpToolResourceName, type RunMcpX402BeforeCallToolOptions };

/**
 * Native Effect MCP x402 enforcement using {@link X402EnforcementService}.
 * Preserves {@link X402McpPaymentRequiredError} / {@link X402McpPaymentDeniedError} for MCP tool results.
 */
export function mcpX402BeforeCallToolEffect(
  options: RunMcpX402BeforeCallToolOptions
): Effect.Effect<void, Error> {
  const env = options.env ?? process.env;
  if (!isX402EnforcementActive(env)) {
    return Effect.void;
  }

  return Effect.gen(function* () {
    const enforcement = yield* X402EnforcementService;
    const resource = mcpToolResourceName(options.toolName);
    const ctx = getMcpX402Context();
    const result = yield* enforcement.enforceGate({
      resource,
      requestUrl: ctx?.requestUrl ?? `mcp://tool/${encodeURIComponent(options.toolName)}`,
      headers: ctx?.headers ?? {},
      correlationId: ctx?.correlationId,
      env,
      fetchImpl: options.fetchImpl,
    });

    if (result.action === "allow") {
      return;
    }
    if (result.action === "require_payment") {
      if (isMppMcpJsonRpcEnabled(env)) {
        return yield* Effect.fail(
          new MppMcpJsonRpcPaymentRequiredError(result.body, resource, env)
        );
      }
      return yield* Effect.fail(new X402McpPaymentRequiredError(result.body));
    }
    if (isMppMcpJsonRpcEnabled(env) && result.mppVerificationCode) {
      return yield* Effect.fail(
        new MppMcpJsonRpcVerificationFailedError(
          result.reason,
          result.resource,
          result.mppVerificationCode
        )
      );
    }
    return yield* Effect.fail(new X402McpPaymentDeniedError(result.reason, result.resource));
  }).pipe(Effect.provide(paymentsServicesLiveLayer(env)));
}
