import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { ProvisionInputs } from "./types.js";
import { buildBootstrapUserData } from "./user-data.js";

export type AwsGoldenHostOutputs = {
  instanceId: pulumi.Output<string>;
  publicIp: pulumi.Output<string>;
  syncPrefix: string;
};

export function createAwsGoldenHost(inputs: ProvisionInputs): AwsGoldenHostOutputs {
  if (!inputs.syncPrefix) {
    throw new Error("syncPrefix is required");
  }

  const userData = buildBootstrapUserData({
    bucket: inputs.syncBucket,
    prefix: inputs.syncPrefix,
    syncProvider: inputs.syncProvider,
    ssmParameterPrefix: inputs.useSsmSecrets ? inputs.ssmParameterPrefix : undefined,
  });

  const role = new aws.iam.Role("clawql-instance-role", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "ec2.amazonaws.com" },
        },
      ],
    }),
    tags: clawqlTags(inputs),
  });

  if (inputs.useSsmSecrets && inputs.ssmParameterPrefix) {
    new aws.iam.RolePolicy("clawql-ssm-read", {
      role: role.id,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["ssm:GetParameter", "ssm:GetParameters"],
            Resource: `arn:aws:ssm:*:*:parameter${inputs.ssmParameterPrefix}/*`,
          },
        ],
      }),
    });
  }

  const profile = new aws.iam.InstanceProfile("clawql-instance-profile", {
    role: role.name,
  });

  const sg = new aws.ec2.SecurityGroup("clawql-mcp-sg", {
    description: "ClawQL MCP HTTP",
    ingress: [{ protocol: "tcp", fromPort: 8080, toPort: 8080, cidrBlocks: ["0.0.0.0/0"] }],
    egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
    tags: clawqlTags(inputs),
  });

  const instance = new aws.ec2.Instance("clawql-golden-host", {
    ami: inputs.goldenImageId,
    instanceType: inputs.instanceType,
    iamInstanceProfile: profile.name,
    vpcSecurityGroupIds: [sg.id],
    userData: userData,
    tags: {
      ...clawqlTags(inputs),
      Name: `clawql-${inputs.tier}-${inputs.tenantId ?? "shared"}`,
    },
  });

  return {
    instanceId: instance.id,
    publicIp: instance.publicIp,
    syncPrefix: inputs.syncPrefix,
  };
}

function clawqlTags(inputs: ProvisionInputs): Record<string, string> {
  return {
    ManagedBy: "pulumi",
    ClawQLTier: inputs.tier,
    ...(inputs.tenantId ? { ClawQLTenant: inputs.tenantId } : {}),
  };
}
