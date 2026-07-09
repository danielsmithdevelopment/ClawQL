import type { ClawQLHorizontalTierSpec } from "../spec/horizontal-tier-spec.js";
import {
  clawqlInstanceSpecToHorizontalTierSpec,
  type ClawQLInstanceSpecV1Alpha1,
} from "../spec/clawql-instance-v1alpha1.js";

export const CLAWQL_INSTANCE_TIER_SPEC_CONFIGMAP_KEY = "horizontalTierSpec.json";

export type TierSpecConfigMapData = {
  readonly horizontalTierSpec: ClawQLHorizontalTierSpec;
  readonly sourceInstance: {
    readonly name: string;
    readonly namespace: string;
    readonly tier?: string;
  };
};

export function buildTierSpecConfigMapData(
  instanceName: string,
  namespace: string,
  spec: ClawQLInstanceSpecV1Alpha1
): TierSpecConfigMapData {
  return {
    horizontalTierSpec: clawqlInstanceSpecToHorizontalTierSpec(spec),
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
    "sourceInstance.json": JSON.stringify(data.sourceInstance, null, 2),
  };
}
