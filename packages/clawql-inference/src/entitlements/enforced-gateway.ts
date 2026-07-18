import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import {
  isCreditsInferenceEnforcementActive,
  isStripeMeterReportingActive,
} from "clawql-payments";
import {
  completeWithEnforcementProgram,
  runEntitlementEffect,
} from "./effect/entitlement-layer.js";
import { isInferenceEntitlementEnforcementActive } from "./flags.js";

export class EntitlementEnforcedGateway implements InferenceGateway {
  constructor(
    private readonly inner: InferenceGateway,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    return runEntitlementEffect(completeWithEnforcementProgram(request), this.inner, this.env);
  }
}

export function withEntitlementEnforcement(
  gateway: InferenceGateway,
  env: NodeJS.ProcessEnv = process.env
): InferenceGateway {
  if (
    !isInferenceEntitlementEnforcementActive(env) &&
    !isStripeMeterReportingActive(env) &&
    !isCreditsInferenceEnforcementActive(env)
  ) {
    return gateway;
  }
  return new EntitlementEnforcedGateway(gateway, env);
}

export { EntitlementLimitError, isEntitlementLimitError } from "./errors.js";
export {
  assertInferenceEntitlement,
  isInferenceEntitlementEnforcementActive,
  recordInferenceUsage,
  recordInferenceBilling,
  resolveInferenceTenantId,
} from "./check.js";
