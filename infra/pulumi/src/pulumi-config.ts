import * as pulumi from "@pulumi/pulumi";
import {
  DEFAULT_INSTANCE_TYPES,
  parseCloudTarget,
  parseManagedTier,
  parseSyncProvider,
  type ProvisionInputs,
} from "./types.js";
import { syncPrefixForTier, ssmParameterPrefixForTenant } from "./tiers.js";

/** Load stack config from Pulumi config namespace `clawql`. */
export function loadProvisionInputs(): ProvisionInputs {
  const cfg = new pulumi.Config("clawql");
  const tier = parseManagedTier(cfg.get("tier"));
  const tenantId = cfg.get("tenantId") ?? undefined;
  const cloud = parseCloudTarget(cfg.require("cloud"));

  const syncBucket = cfg.require("syncBucket");
  const syncProvider = parseSyncProvider(cfg.get("syncProvider"));
  const syncPrefix = syncPrefixForTier(tier, {
    tenantId,
    customPrefix: cfg.get("syncPrefix") ?? undefined,
  });

  const goldenImageId = cfg.require("goldenImageId");
  const region = cfg.get("region") ?? (cloud === "aws" ? "us-east-1" : "us-central1");
  const instanceType = cfg.get("instanceType") ?? DEFAULT_INSTANCE_TYPES[cloud];

  const useSsmSecrets = cfg.getBoolean("useSsmSecrets") ?? tier === "dedicated";
  const ssmParameterPrefix =
    cfg.get("ssmParameterPrefix") ??
    (tenantId && useSsmSecrets ? ssmParameterPrefixForTenant(tenantId) : undefined);

  const cloudflareAccountId = new pulumi.Config("cloudflare").get("accountId");
  const gcpProject = new pulumi.Config("gcp").get("project");

  return {
    cloud,
    tier,
    tenantId,
    syncBucket,
    syncProvider,
    syncPrefix,
    goldenImageId,
    instanceType,
    region,
    useSsmSecrets,
    ssmParameterPrefix,
    cloudflareAccountId,
    gcpProject,
    gcpZone: cfg.get("gcpZone") ?? `${region}-a`,
  };
}
