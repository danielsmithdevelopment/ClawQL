import type { NextFunction, Request, Response } from "express";
import { isX402EnforcementActive } from "./config.js";
import {
  enforceX402Gate,
  paymentRequiredHeaders,
  resolveX402ResourceFromRequest,
} from "./enforce.js";

export type X402PaymentRequest = Request & {
  x402Payer?: string;
  x402Resource?: string;
};

export type CreateX402PaymentMiddlewareOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  resourceResolver?: (req: Request) => string;
};

export function createX402PaymentMiddleware(options: CreateX402PaymentMiddlewareOptions = {}) {
  const env = options.env ?? process.env;

  return async function x402PaymentMiddleware(
    req: X402PaymentRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (!isX402EnforcementActive(env)) {
      next();
      return;
    }

    const resource =
      options.resourceResolver?.(req) ??
      resolveX402ResourceFromRequest({
        path: req.path,
        toolHeader:
          typeof req.header("x-clawql-tool") === "string"
            ? req.header("x-clawql-tool")!
            : undefined,
      });

    const requestUrl = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
    const correlationId =
      req.header("x-correlation-id") ?? req.header("x-clawql-correlation-id") ?? undefined;

    try {
      const result = await enforceX402Gate({
        resource,
        requestUrl,
        headers: req.headers,
        correlationId,
        env,
        fetchImpl: options.fetchImpl,
      });

      if (result.action === "allow") {
        if (result.payer) req.x402Payer = result.payer;
        if (result.resource) req.x402Resource = result.resource;
        next();
        return;
      }

      if (result.action === "require_payment") {
        const headers = paymentRequiredHeaders(result.body);
        for (const [key, value] of Object.entries(headers)) {
          res.setHeader(key, value);
        }
        res.status(402).json(result.body);
        return;
      }

      res.status(402).json({
        x402Version: 2,
        error: result.reason,
        resource: { url: requestUrl },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        error: "x402 enforcement failed",
        message,
      });
    }
  };
}
