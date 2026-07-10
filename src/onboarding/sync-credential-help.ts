import type { SyncProvider } from "../home-sync/types.js";

export function printSyncCredentialHelp(provider: SyncProvider): void {
  console.log("\nCredentials (not stored in sync.json):");
  if (provider === "r2") {
    console.log("  CLAWQL_R2_ACCOUNT_ID            Cloudflare account id");
    console.log("  CLAWQL_SYNC_ACCESS_KEY_ID       R2 S3 API access key");
    console.log("  CLAWQL_SYNC_SECRET_ACCESS_KEY   R2 S3 API secret");
    console.log("  Or: r2AccessKeyId / r2SecretAccessKey / cloudflareAccountId in vault");
    return;
  }
  if (provider === "s3") {
    console.log("  CLAWQL_AWS_ACCESS_KEY_ID        IAM access key (or awsAccessKeyId in vault)");
    console.log("  CLAWQL_AWS_SECRET_ACCESS_KEY    IAM secret key");
    console.log("  CLAWQL_AWS_REGION               e.g. us-east-1 (or CLAWQL_SYNC_REGION)");
    return;
  }
  console.log("  CLAWQL_GCS_HMAC_ACCESS_ID       GCS interoperability HMAC access id");
  console.log("  CLAWQL_GCS_HMAC_SECRET          GCS interoperability HMAC secret");
  console.log("  CLAWQL_SYNC_ENDPOINT            https://storage.googleapis.com (default when unset)");
  console.log("  Or: gcsHmacAccessId / gcsHmacSecret in vault");
  console.log("  GCP: Cloud Storage → Settings → Interoperability → Create HMAC key");
}

export function syncProviderLabel(provider: SyncProvider): string {
  if (provider === "r2") return "Cloudflare R2 (default)";
  if (provider === "s3") return "Amazon S3";
  return "Google Cloud Storage";
}
