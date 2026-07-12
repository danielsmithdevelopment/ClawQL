import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import {
  assertInferenceEntitlement,
  isInferenceEntitlementEnforcementActive,
  recordInferenceBilling,
  resolveInferenceTenantId,
} from "./check.js";
import { isStripeMeterReportingActive } from "clawql-payments";

export class EntitlementEnforcedGateway implements InferenceGateway {
  constructor(
    private readonly inner: InferenceGateway,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    const tenantId = await resolveInferenceTenantId(
      { team: request.team, tenantId: request.tenantId },
      this.env
    );

    if (isInferenceEntitlementEnforcementActive(this.env)) {
      await assertInferenceEntitlement({
        tenantId,
        correlationId: request.correlationId,
        env: this.env,
      });
    }

    const response = await this.inner.complete(request);
    await recordInferenceBilling({
      tenantId,
      correlationId: request.correlationId,
      env: this.env,
    });
    return response;
  }
}

export function withEntitlementEnforcement(
  gateway: InferenceGateway,
  env: NodeJS.ProcessEnv = process.env
): InferenceGateway {
  if (!isInferenceEntitlementEnforcementActive(env) && !isStripeMeterReportingActive(env)) {
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
