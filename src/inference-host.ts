/**
 * Process-wide inference gateway wired to ClawQL host hookRegistry / worm (8.0 model hooks).
 */

import { createInferenceGateway, type InferenceGateway } from "clawql-inference";
import { modelHooksFromClawqlApi } from "clawql-api";
import { getClawqlApi } from "./clawql-api-adapters.js";

let gateway: InferenceGateway | undefined;

/**
 * Inference gateway with `pre-model` / `post-model` hooks from the process ClawQL API.
 * Lazy — first call builds via {@link getClawqlApi}.
 */
export function getHostInferenceGateway(
  env: NodeJS.ProcessEnv = process.env
): InferenceGateway {
  if (!gateway) {
    const api = getClawqlApi();
    gateway = createInferenceGateway({
      env,
      modelHooks: modelHooksFromClawqlApi(api),
    });
  }
  return gateway;
}

/** Test helper — next {@link getHostInferenceGateway} rebuilds. */
export function resetHostInferenceGatewayForTests(): void {
  gateway = undefined;
}
