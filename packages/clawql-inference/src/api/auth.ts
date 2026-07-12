import type { NextFunction, Request, Response } from "express";
import { sendOpenAiError } from "./openai-errors.js";
import { keysEnforcementActive } from "../keys/store.js";
import { extractPresentedApiKey, validateVirtualKey } from "../keys/validate.js";
import type { VirtualKeyContext } from "../keys/types.js";

export type VirtualKeyRequest = Request & {
  virtualKey?: VirtualKeyContext;
};

export type CreateVirtualKeyAuthMiddlewareOptions = {
  env?: NodeJS.ProcessEnv;
};

export function createVirtualKeyAuthMiddleware(
  options: CreateVirtualKeyAuthMiddlewareOptions = {}
) {
  const env = options.env ?? process.env;
  return (req: VirtualKeyRequest, res: Response, next: NextFunction): void => {
    if (!keysEnforcementActive(env)) {
      next();
      return;
    }

    const path = req.path;
    if (path === "/healthz" || path === "/v1") {
      next();
      return;
    }

    const secret = extractPresentedApiKey(req.headers);
    const result = validateVirtualKey(secret, env);
    if (!result.ok) {
      sendOpenAiError(res, result.status, result.message, result.type);
      return;
    }

    req.virtualKey = result.context;
    next();
  };
}
