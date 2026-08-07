import { z } from "zod";
import type { ProvisionProfile } from "./profiles.js";

export const ManagedTierSchema = z.enum(["shared", "dedicated", "enterprise"]);
export type ManagedTier = z.infer<typeof ManagedTierSchema>;

export const CloudTargetSchema = z.enum(["aws", "gcp", "cloudflare"]);
export type CloudTarget = z.infer<typeof CloudTargetSchema>;

export const SyncProviderSchema = z.enum(["r2", "s3", "gcs"]);
export type SyncProvider = z.infer<typeof SyncProviderSchema>;

/** Stack inputs (cloud-agnostic + profile-specific optional fields). */
export type ProvisionInputs = {
  cloud: CloudTarget;
  /** Which infra program to run (defaults from cloud when unset). */
  profile: ProvisionProfile;
  tier: ManagedTier;
  tenantId?: string;
  syncBucket: string;
  syncProvider: SyncProvider;
  syncPrefix?: string;
  /** Required for `aws` / `gcp` golden-host stacks; omitted for cloudflare / idp-k3s (Ubuntu AMI). */
  goldenImageId?: string;
  instanceType: string;
  region: string;
  /** When true, user-data fetches sync credentials from SSM at boot (AWS). */
  useSsmSecrets?: boolean;
  ssmParameterPrefix?: string;
  /**
   * When true, boot starts Managed Edge Gateway after team vault sync
   * (Dedicated VG alpha). Defaults on for dedicated/enterprise tiers.
   */
  startManagedGateway?: boolean;
  cloudflareAccountId?: string;
  gcpProject?: string;
  gcpZone?: string;

  // --- edge (Cloudflare Developer/Teams) ---
  edgeNamePrefix?: string;
  r2Location?: string;
  d1LocationHint?: string;
  deployWorkerStub?: boolean;
  workerScriptName?: string;

  // --- idp-k3s ---
  ebsVolumeSizeGb?: number;
  sshCidrBlocks?: string[];
  apiCidrBlocks?: string[];
  gitopsRepoUrl?: string;

  // --- eks ---
  eksClusterName?: string;
  eksVersion?: string;
  eksPublicEndpoint?: boolean;
  eksReservedDesiredSize?: number;
  eksReservedMinSize?: number;
  eksReservedMaxSize?: number;
  vpcId?: string;
  subnetIds?: string[];
};

export const DEFAULT_INSTANCE_TYPES: Record<CloudTarget, string> = {
  aws: "t3.medium",
  gcp: "e2-medium",
  cloudflare: "n/a",
};

/** Defaults when profile overrides generic cloud defaults. */
export const PROFILE_DEFAULT_INSTANCE: Partial<Record<ProvisionProfile, string>> = {
  "idp-k3s": "r7i.2xlarge",
  eks: "r7i.xlarge",
  "golden-host": "t3.medium",
};

export function parseManagedTier(raw: string | undefined): ManagedTier {
  const parsed = ManagedTierSchema.safeParse(raw ?? "shared");
  if (!parsed.success) {
    throw new Error(`Invalid tier "${raw}" — expected shared | dedicated | enterprise`);
  }
  return parsed.data;
}

export function parseCloudTarget(raw: string | undefined): CloudTarget {
  const parsed = CloudTargetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid cloud "${raw}" — expected aws | gcp | cloudflare`);
  }
  return parsed.data;
}

export function parseSyncProvider(raw: string | undefined): SyncProvider {
  const parsed = SyncProviderSchema.safeParse(raw ?? "r2");
  if (!parsed.success) {
    throw new Error(`Invalid syncProvider "${raw}" — expected r2 | s3 | gcs`);
  }
  return parsed.data;
}
