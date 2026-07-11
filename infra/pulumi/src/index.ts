import * as pulumi from "@pulumi/pulumi";
import { createAwsGoldenHost } from "./aws.js";
import { createCloudflareTeamVault } from "./cloudflare.js";
import { createGcpGoldenHost } from "./gcp.js";
import { loadProvisionInputs } from "./pulumi-config.js";

const inputs = loadProvisionInputs();

export const cloud = inputs.cloud;
export const tier = inputs.tier;
export const syncPrefix = inputs.syncPrefix ?? "";
export const syncBucket = inputs.syncBucket;

export let instanceId: pulumi.Output<string> | undefined;
export let publicIp: pulumi.Output<string> | undefined;
export let instanceName: pulumi.Output<string> | undefined;
export let externalIp: pulumi.Output<string | undefined> | undefined;
export let bucketName: pulumi.Output<string> | undefined;

switch (inputs.cloud) {
  case "aws": {
    const awsOut = createAwsGoldenHost(inputs);
    instanceId = awsOut.instanceId;
    publicIp = awsOut.publicIp;
    break;
  }
  case "gcp": {
    const gcpOut = createGcpGoldenHost(inputs);
    instanceName = gcpOut.instanceName;
    externalIp = gcpOut.externalIp;
    break;
  }
  case "cloudflare": {
    const cfOut = createCloudflareTeamVault(inputs);
    bucketName = cfOut.bucketName;
    break;
  }
  default: {
    const _exhaustive: never = inputs.cloud;
    throw new Error(`Unsupported cloud: ${_exhaustive}`);
  }
}
