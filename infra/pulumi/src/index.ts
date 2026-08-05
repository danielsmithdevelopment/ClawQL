import * as pulumi from "@pulumi/pulumi";
import { createAwsGoldenHost } from "./aws.js";
import { createAwsEks } from "./aws-eks.js";
import { createAwsIdpK3s } from "./aws-idp-k3s.js";
import { createCloudflareTeamVault } from "./cloudflare.js";
import { createCloudflareEdge } from "./cloudflare-edge.js";
import { createGcpGoldenHost } from "./gcp.js";
import { loadProvisionInputs } from "./pulumi-config.js";

const inputs = loadProvisionInputs();

export const cloud = inputs.cloud;
export const profile = inputs.profile;
export const tier = inputs.tier;
export const syncPrefix = inputs.syncPrefix ?? "";
export const syncBucket = inputs.syncBucket;

export let instanceId: pulumi.Output<string> | undefined;
export let publicIp: pulumi.Output<string> | undefined;
export let privateIp: pulumi.Output<string> | undefined;
export let instanceName: pulumi.Output<string> | undefined;
export let externalIp: pulumi.Output<string | undefined> | undefined;
export let bucketName: pulumi.Output<string> | undefined;
export let volumeId: pulumi.Output<string> | undefined;
export let kvNamespaceId: pulumi.Output<string> | undefined;
export let d1DatabaseId: pulumi.Output<string> | undefined;
export let queueId: pulumi.Output<string> | undefined;
export let workerScriptName: pulumi.Output<string> | undefined;
export let clusterName: pulumi.Output<string> | undefined;
export let clusterEndpoint: pulumi.Output<string> | undefined;
export let karpenterControllerRoleArn: pulumi.Output<string> | undefined;
export let karpenterNodeRoleArn: pulumi.Output<string> | undefined;
export let karpenterGitopsPath: string | undefined;
export let bindingHints: Record<string, string> | undefined;

switch (inputs.profile) {
  case "golden-host": {
    if (inputs.cloud === "aws") {
      const awsOut = createAwsGoldenHost(inputs);
      instanceId = awsOut.instanceId;
      publicIp = awsOut.publicIp;
    } else if (inputs.cloud === "gcp") {
      const gcpOut = createGcpGoldenHost(inputs);
      instanceName = gcpOut.instanceName;
      externalIp = gcpOut.externalIp;
    } else {
      throw new Error("golden-host profile requires clawql:cloud aws or gcp");
    }
    break;
  }
  case "team-vault": {
    if (inputs.cloud !== "cloudflare") {
      throw new Error("team-vault profile requires clawql:cloud cloudflare");
    }
    const cfOut = createCloudflareTeamVault(inputs);
    bucketName = cfOut.bucketName;
    break;
  }
  case "edge": {
    if (inputs.cloud !== "cloudflare") {
      throw new Error("edge profile requires clawql:cloud cloudflare");
    }
    const edge = createCloudflareEdge(inputs);
    bucketName = edge.vaultBucketName;
    kvNamespaceId = edge.kvNamespaceId;
    d1DatabaseId = edge.d1DatabaseId;
    queueId = edge.queueId;
    workerScriptName = edge.workerScriptName;
    bindingHints = edge.bindingHints;
    break;
  }
  case "idp-k3s": {
    if (inputs.cloud !== "aws") {
      throw new Error("idp-k3s profile requires clawql:cloud aws");
    }
    const k3s = createAwsIdpK3s(inputs);
    instanceId = k3s.instanceId;
    publicIp = k3s.publicIp;
    privateIp = k3s.privateIp;
    volumeId = k3s.volumeId;
    break;
  }
  case "eks": {
    if (inputs.cloud !== "aws") {
      throw new Error("eks profile requires clawql:cloud aws");
    }
    const eks = createAwsEks(inputs);
    clusterName = eks.clusterName;
    clusterEndpoint = eks.clusterEndpoint;
    karpenterControllerRoleArn = eks.karpenterControllerRoleArn;
    karpenterNodeRoleArn = eks.karpenterNodeRoleArn;
    karpenterGitopsPath = eks.karpenterGitopsPath;
    break;
  }
  default: {
    const _exhaustive: never = inputs.profile;
    throw new Error(`Unsupported profile: ${_exhaustive}`);
  }
}
