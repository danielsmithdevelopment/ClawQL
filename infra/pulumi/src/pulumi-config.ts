import * as pulumi from "@pulumi/pulumi";
import {
  DEFAULT_INSTANCE_TYPES,
  PROFILE_DEFAULT_INSTANCE,
  parseCloudTarget,
  parseManagedTier,
  parseSyncProvider,
  type ProvisionInputs,
} from "./types.js";
import { defaultProfileForCloud, parseProvisionProfile } from "./profiles.js";
import { syncPrefixForTier, ssmParameterPrefixForTenant } from "./tiers.js";

function parseCsv(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Load stack config from Pulumi config namespace `clawql`. */
export function loadProvisionInputs(): ProvisionInputs {
  const cfg = new pulumi.Config("clawql");
  const tier = parseManagedTier(cfg.get("tier"));
  const tenantId = cfg.get("tenantId") ?? undefined;
  const cloud = parseCloudTarget(cfg.require("cloud"));

  const profileRaw = cfg.get("profile");
  const profile = profileRaw
    ? parseProvisionProfile(profileRaw)
    : defaultProfileForCloud(cloud);

  const syncBucket =
    cfg.get("syncBucket") ??
    (profile === "edge" || profile === "team-vault" || profile === "idp-k3s" || profile === "eks"
      ? "clawql-vault-prod"
      : undefined);
  if (!syncBucket) {
    throw new Error("clawql:syncBucket is required (except when using edge defaults)");
  }

  const syncProvider = parseSyncProvider(cfg.get("syncProvider"));
  const needsSyncPrefix = profile === "golden-host" || profile === "team-vault";
  const syncPrefix = needsSyncPrefix
    ? syncPrefixForTier(tier, {
        tenantId,
        customPrefix: cfg.get("syncPrefix") ?? undefined,
      })
    : cfg.get("syncPrefix") ??
      (tenantId ? `tenant/${tenantId}/` : "shared/");

  const needsGoldenImage = profile === "golden-host" && (cloud === "aws" || cloud === "gcp");
  const goldenImageId = needsGoldenImage
    ? cfg.require("goldenImageId")
    : (cfg.get("goldenImageId") ?? undefined);

  const region = cfg.get("region") ?? (cloud === "aws" || profile === "idp-k3s" || profile === "eks" ? "us-east-1" : "us-central1");
  const instanceType =
    cfg.get("instanceType") ??
    PROFILE_DEFAULT_INSTANCE[profile] ??
    DEFAULT_INSTANCE_TYPES[cloud];

  const useSsmSecrets = cfg.getBoolean("useSsmSecrets") ?? tier === "dedicated";
  const ssmParameterPrefix =
    cfg.get("ssmParameterPrefix") ??
    (tenantId && useSsmSecrets ? ssmParameterPrefixForTenant(tenantId) : undefined);

  const cloudflareAccountId = new pulumi.Config("cloudflare").get("accountId");
  const gcpProject = new pulumi.Config("gcp").get("project");

  return {
    cloud,
    profile,
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

    edgeNamePrefix: cfg.get("edgeNamePrefix") ?? "clawql",
    r2Location: cfg.get("r2Location") ?? undefined,
    d1LocationHint: cfg.get("d1LocationHint") ?? undefined,
    deployWorkerStub: cfg.getBoolean("deployWorkerStub") ?? false,
    workerScriptName: cfg.get("workerScriptName") ?? undefined,

    ebsVolumeSizeGb: cfg.getNumber("ebsVolumeSizeGb") ?? 200,
    sshCidrBlocks: parseCsv(cfg.get("sshCidrBlocks")),
    apiCidrBlocks: parseCsv(cfg.get("apiCidrBlocks")),
    gitopsRepoUrl: cfg.get("gitopsRepoUrl") ?? undefined,

    eksClusterName: cfg.get("eksClusterName") ?? undefined,
    eksVersion: cfg.get("eksVersion") ?? "1.32",
    eksPublicEndpoint: cfg.getBoolean("eksPublicEndpoint") ?? true,
    eksReservedDesiredSize: cfg.getNumber("eksReservedDesiredSize") ?? 2,
    eksReservedMinSize: cfg.getNumber("eksReservedMinSize") ?? 1,
    eksReservedMaxSize: cfg.getNumber("eksReservedMaxSize") ?? 4,
    vpcId: cfg.get("vpcId") ?? undefined,
    subnetIds: parseCsv(cfg.get("subnetIds")),
  };
}
