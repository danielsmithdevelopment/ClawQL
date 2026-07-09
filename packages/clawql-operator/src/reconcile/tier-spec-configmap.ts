import type { ClawQLHorizontalTierSpec } from "../spec/horizontal-tier-spec.js";
import {
  clawqlInstanceSpecToHorizontalTierSpec,
  type ClawQLInstanceSpecV1Alpha1,
} from "../spec/clawql-instance-v1alpha1.js";
import {
  buildAuthExpectationsPayload,
  CLAWQL_INSTANCE_AUTH_EXPECTATIONS_KEY,
  type AuthExpectationsPayload,
} from "./auth-expectations.js";

export const CLAWQL_INSTANCE_TIER_SPEC_CONFIGMAP_KEY = "horizontalTierSpec.json";

export type TierSpecConfigMapData = {
  readonly horizontalTierSpec: ClawQLHorizontalTierSpec;
  readonly authExpectations: AuthExpectationsPayload;
  readonly sourceInstance: {
    readonly name: string;
    readonly namespace: string;
    readonly tier?: string;
  };
};

export function buildTierSpecConfigMapData(
  instanceName: string,
  namespace: string,
  spec: ClawQLInstanceSpecV1Alpha1,
  providerSecretName?: string
): TierSpecConfigMapData {
  return {
    horizontalTierSpec: clawqlInstanceSpecToHorizontalTierSpec(spec),
    authExpectations: buildAuthExpectationsPayload(spec, providerSecretName),
    sourceInstance: {
      name: instanceName,
      namespace,
      tier: spec.tier,
    },
  };
}

export function tierSpecConfigMapName(instanceName: string): string {
  return `${instanceName}-tier-spec`;
}

export function serializeTierSpecConfigMap(data: TierSpecConfigMapData): Record<string, string> {
  return {
    [CLAWQL_INSTANCE_TIER_SPEC_CONFIGMAP_KEY]: JSON.stringify(data.horizontalTierSpec, null, 2),
    [CLAWQL_INSTANCE_AUTH_EXPECTATIONS_KEY]: JSON.stringify(data.authExpectations, null, 2),
    "sourceInstance.json": JSON.stringify(data.sourceInstance, null, 2),
  };
}
