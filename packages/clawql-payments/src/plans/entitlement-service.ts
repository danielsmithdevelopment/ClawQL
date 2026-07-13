import { Context, Effect, Layer } from "effect";
import { EntitlementLimitError } from "../errors/payment-errors.js";
import {
  checkEntitlementLimit,
  type LimitCheckResult,
  type LimitEnforcementInput,
} from "./limits.js";

/** Effect service for managed plan entitlement checks. */
export class EntitlementService extends Context.Tag("clawql/EntitlementService")<
  EntitlementService,
  {
    readonly checkLimit: (input: LimitEnforcementInput) => Effect.Effect<LimitCheckResult, never>;
    readonly enforceLimit: (
      input: LimitEnforcementInput
    ) => Effect.Effect<void, EntitlementLimitError>;
  }
>() {}

export function entitlementLiveLayer(): Layer.Layer<EntitlementService> {
  return Layer.succeed(
    EntitlementService,
    EntitlementService.of({
      checkLimit: (input) => Effect.sync(() => checkEntitlementLimit(input)),
      enforceLimit: (input) => {
        const result = checkEntitlementLimit(input);
        if (!result.allowed) {
          return Effect.fail(
            new EntitlementLimitError({
              reason: result.reason,
              resource: input.resource,
            })
          );
        }
        return Effect.void;
      },
    })
  );
}

export { checkEntitlementLimit };
