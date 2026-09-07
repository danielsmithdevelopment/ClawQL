/**
 * In-memory / injectable outbound policy + enablement state.
 */

import { Context, Effect, Layer, Ref } from "effect";
import {
  loadOutboundPaymentPolicy,
  type OutboundPaymentPolicy,
  type OutboundPaymentPolicyAccepted,
  OutboundPolicyError,
  ConfigError,
} from "clawql-core";
import type { OutboundTenantState } from "./types.js";

export class OutboundPolicyStoreService extends Context.Tag("clawql/OutboundPolicyStoreService")<
  OutboundPolicyStoreService,
  {
    readonly getPolicy: (
      tenantId: string
    ) => Effect.Effect<OutboundPaymentPolicyAccepted | null, never>;
    readonly acceptPolicy: (
      tenantId: string,
      raw: unknown
    ) => Effect.Effect<
      OutboundPaymentPolicyAccepted,
      OutboundPolicyError | ConfigError
    >;
    readonly getTenantState: (
      tenantId: string
    ) => Effect.Effect<OutboundTenantState, never>;
    readonly markOutboundEnabled: (
      tenantId: string,
      policyVersionId: string
    ) => Effect.Effect<void, never>;
  }
>() {}

export function createMemoryOutboundPolicyStoreLayer(
  seed?: ReadonlyMap<string, OutboundPaymentPolicyAccepted>
): Layer.Layer<OutboundPolicyStoreService> {
  return Layer.effect(
    OutboundPolicyStoreService,
    Effect.gen(function* () {
      const policies = yield* Ref.make(
        new Map<string, OutboundPaymentPolicyAccepted>(seed ? [...seed] : [])
      );
      const enabled = yield* Ref.make(new Map<string, OutboundTenantState>());

      return OutboundPolicyStoreService.of({
        getPolicy: (tenantId) =>
          Effect.gen(function* () {
            const map = yield* Ref.get(policies);
            return map.get(tenantId) ?? null;
          }),
        acceptPolicy: (tenantId, raw) =>
          Effect.gen(function* () {
            const map = yield* Ref.get(policies);
            const previous: OutboundPaymentPolicy | null =
              map.get(tenantId)?.policy ?? null;
            const accepted = yield* loadOutboundPaymentPolicy(raw, previous);
            yield* Ref.update(policies, (m) => {
              const copy = new Map(m);
              copy.set(tenantId, accepted);
              return copy;
            });
            return accepted;
          }),
        getTenantState: (tenantId) =>
          Effect.gen(function* () {
            const map = yield* Ref.get(enabled);
            return (
              map.get(tenantId) ?? {
                outboundPaymentEverEnabled: false,
                policyVersionId: "",
              }
            );
          }),
        markOutboundEnabled: (tenantId, policyVersionId) =>
          Ref.update(enabled, (m) => {
            const copy = new Map(m);
            copy.set(tenantId, {
              outboundPaymentEverEnabled: true,
              policyVersionId,
            });
            return copy;
          }),
      });
    })
  );
}
