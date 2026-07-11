import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import type { ProvisionInputs } from "./types.js";

export type CloudflareTeamVaultOutputs = {
  bucketName: pulumi.Output<string>;
  syncPrefix: string;
};

/**
 * Cloudflare managed tier: provision team vault bucket (R2).
 * Workers/containers use `cloudflare-bootstrap.sh` at first invocation — no VM AMI.
 */
export function createCloudflareTeamVault(inputs: ProvisionInputs): CloudflareTeamVaultOutputs {
  if (!inputs.cloudflareAccountId) {
    throw new Error("cloudflare:accountId config is required");
  }
  if (!inputs.syncPrefix) {
    throw new Error("syncPrefix is required");
  }

  const bucketName =
    inputs.tier === "dedicated" && inputs.tenantId
      ? `${inputs.syncBucket}-${inputs.tenantId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      : inputs.syncBucket;

  const bucket = new cloudflare.R2Bucket("clawql-team-vault", {
    accountId: inputs.cloudflareAccountId,
    name: bucketName,
    location: "WEUR",
  });

  return {
    bucketName: bucket.name,
    syncPrefix: inputs.syncPrefix,
  };
}
