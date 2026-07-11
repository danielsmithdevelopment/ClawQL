import { z } from "zod";

export const ManagedTierSchema = z.enum(["shared", "dedicated", "enterprise"]);
export type ManagedTier = z.infer<typeof ManagedTierSchema>;

export const CloudTargetSchema = z.enum(["aws", "gcp", "cloudflare"]);
export type CloudTarget = z.infer<typeof CloudTargetSchema>;

export const SyncProviderSchema = z.enum(["r2", "s3", "gcs"]);
export type SyncProvider = z.infer<typeof SyncProviderSchema>;

/** Stack inputs (cloud-agnostic). */
export type ProvisionInputs = {
  cloud: CloudTarget;
  tier: ManagedTier;
  tenantId?: string;
  syncBucket: string;
  syncProvider: SyncProvider;
  syncPrefix?: string;
  /** Required for `aws` / `gcp` golden-host stacks; omitted for `cloudflare` (R2-only). */
  goldenImageId?: string;
  instanceType: string;
  region: string;
  /** When true, user-data fetches sync credentials from SSM at boot (AWS). */
  useSsmSecrets?: boolean;
  ssmParameterPrefix?: string;
  cloudflareAccountId?: string;
  gcpProject?: string;
  gcpZone?: string;
};

export const DEFAULT_INSTANCE_TYPES: Record<CloudTarget, string> = {
  aws: "t3.medium",
  gcp: "e2-medium",
  cloudflare: "n/a",
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
