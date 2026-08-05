import { z } from "zod";

/**
 * Provisioning profile — selects which infra program to run.
 *
 * - golden-host: Packer AMI/image → EC2/GCE (ADR 0007 original)
 * - team-vault: Cloudflare R2 bucket only (existing cloudflare path)
 * - edge: Cloudflare Developer/Teams launch stack (R2 + KV + D1 + Queues [+ optional Worker stub])
 * - idp-k3s: AWS single-node K3s bootstrap for first Shared/Dedicated customer
 * - eks: AWS EKS + Karpenter IAM / GitOps scaffolding for Phase 3 shared tenancy
 */
export const ProvisionProfileSchema = z.enum([
  "golden-host",
  "team-vault",
  "edge",
  "idp-k3s",
  "eks",
]);
export type ProvisionProfile = z.infer<typeof ProvisionProfileSchema>;

export function parseProvisionProfile(raw: string | undefined): ProvisionProfile {
  const parsed = ProvisionProfileSchema.safeParse(raw ?? "golden-host");
  if (!parsed.success) {
    throw new Error(
      `Invalid profile "${raw}" — expected golden-host | team-vault | edge | idp-k3s | eks`
    );
  }
  return parsed.data;
}

/** Default profile when only `clawql:cloud` is set (backward compatible). */
export function defaultProfileForCloud(cloud: "aws" | "gcp" | "cloudflare"): ProvisionProfile {
  if (cloud === "cloudflare") return "team-vault";
  return "golden-host";
}
