import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import {
  assertInferenceEntitlement,
  isInferenceEntitlementEnforcementActive,
  recordInferenceUsage,
  resolveInferenceTenantId,
} from "./check.js";

export class EntitlementEnforcedGateway implements InferenceGateway {
  constructor(
    private readonly inner: InferenceGateway,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    if (!isInferenceEntitlementEnforcementActive(this.env)) {
      return this.inner.complete(request);
    }

    const tenantId = await resolveInferenceTenantId(
      { team: request.team, tenantId: request.tenantId },
      this.env
    );

    await assertInferenceEntitlement({
      tenantId,
      correlationId: request.correlationId,
      env: this.env,
    });

    const response = await this.inner.complete(request);
    await recordInferenceUsage({ tenantId, env: this.env });
    return response;
  }
}

export function withEntitlementEnforcement(
  gateway: InferenceGateway,
  env: NodeJS.ProcessEnv = process.env
): InferenceGateway {
  if (!isInferenceEntitlementEnforcementActive(env)) return gateway;
  return new EntitlementEnforcedGateway(gateway, env);
}

export { EntitlementLimitError, isEntitlementLimitError } from "./errors.js";
export {
  assertInferenceEntitlement,
  isInferenceEntitlementEnforcementActive,
  recordInferenceUsage,
  resolveInferenceTenantId,
} from "./check.js";
