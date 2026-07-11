import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import type { ProvisionInputs } from "./types.js";
import { buildGcpStartupScript } from "./user-data.js";

export type GcpGoldenHostOutputs = {
  instanceName: pulumi.Output<string>;
  externalIp: pulumi.Output<string | undefined>;
  syncPrefix: string;
};

export function createGcpGoldenHost(inputs: ProvisionInputs): GcpGoldenHostOutputs {
  if (!inputs.gcpProject) {
    throw new Error("gcp:project config is required for GCP stacks");
  }
  if (!inputs.syncPrefix) {
    throw new Error("syncPrefix is required");
  }

  const startupScript = buildGcpStartupScript({
    bucket: inputs.syncBucket,
    prefix: inputs.syncPrefix,
    syncProvider: inputs.syncProvider,
  });

  const instance = new gcp.compute.Instance("clawql-golden-host", {
    machineType: inputs.instanceType,
    zone: inputs.gcpZone ?? "us-central1-a",
    bootDisk: {
      initializeParams: {
        image: inputs.goldenImageId,
      },
    },
    networkInterfaces: [
      {
        accessConfigs: [{}],
      },
    ],
    metadata: {
      "startup-script": startupScript,
      "clawql-tier": inputs.tier,
      ...(inputs.tenantId ? { "clawql-tenant": inputs.tenantId } : {}),
    },
    tags: ["clawql-mcp", `clawql-${inputs.tier}`],
  });

  return {
    instanceName: instance.name,
    externalIp: instance.networkInterfaces.apply((ifs) => ifs[0]?.accessConfigs?.[0]?.natIp),
    syncPrefix: inputs.syncPrefix,
  };
}
