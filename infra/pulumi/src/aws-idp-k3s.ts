import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { ProvisionInputs } from "./types.js";
import { buildK3sBootstrapUserData } from "./k3s-user-data.js";

export type AwsIdpK3sOutputs = {
  instanceId: pulumi.Output<string>;
  publicIp: pulumi.Output<string>;
  privateIp: pulumi.Output<string>;
  volumeId: pulumi.Output<string>;
  securityGroupId: pulumi.Output<string>;
  /** Operators use this AMI unless overridden — Ubuntu 24.04 LTS by default. */
  amiId: pulumi.Output<string>;
};

/**
 * AWS IDP bootstrap: single memory-optimized node for K3s + clawql-idp (GTM Phase 2).
 * Default instance: r7i.2xlarge (8 vCPU / 64 GB) per GTM playbook.
 */
export function createAwsIdpK3s(inputs: ProvisionInputs): AwsIdpK3sOutputs {
  const instanceType = inputs.instanceType || "r7i.2xlarge";
  const volumeSizeGb = inputs.ebsVolumeSizeGb ?? 200;

  const amiId =
    inputs.goldenImageId ??
    aws.ec2
      .getAmiOutput({
        mostRecent: true,
        owners: ["099720109477"], // Canonical
        filters: [
          { name: "name", values: ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"] },
          { name: "virtualization-type", values: ["hvm"] },
          { name: "architecture", values: ["x86_64"] },
        ],
      })
      .id;

  const role = new aws.iam.Role("clawql-idp-k3s-role", {
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

  // SSM Session Manager + ECR pull for ClawQL images
  new aws.iam.RolePolicyAttachment("clawql-idp-k3s-ssm", {
    role: role.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  });

  const profile = new aws.iam.InstanceProfile("clawql-idp-k3s-profile", {
    role: role.name,
  });

  const sg = new aws.ec2.SecurityGroup("clawql-idp-k3s-sg", {
    description: "ClawQL IDP K3s — API, HTTPS ingress, NodePorts",
    ingress: [
      { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: inputs.sshCidrBlocks ?? ["0.0.0.0/0"] },
      { protocol: "tcp", fromPort: 6443, toPort: 6443, cidrBlocks: inputs.apiCidrBlocks ?? ["0.0.0.0/0"] },
      { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
      { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] },
      // Kubelet / Flannel VXLAN optional for multi-node later
      { protocol: "udp", fromPort: 8472, toPort: 8472, self: true },
      { protocol: "tcp", fromPort: 10250, toPort: 10250, self: true },
    ],
    egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
    tags: clawqlTags(inputs),
  });

  const userData = buildK3sBootstrapUserData({
    nodeName: `clawql-idp-${inputs.tenantId ?? "bootstrap"}`,
    r2Bucket: inputs.syncBucket,
    gitopsRepoUrl: inputs.gitopsRepoUrl,
  });

  const instance = new aws.ec2.Instance("clawql-idp-k3s", {
    ami: amiId,
    instanceType,
    iamInstanceProfile: profile.name,
    vpcSecurityGroupIds: [sg.id],
    userData,
    rootBlockDevice: {
      volumeSize: Math.max(40, Math.min(volumeSizeGb, 80)),
      volumeType: "gp3",
      encrypted: true,
    },
    tags: {
      ...clawqlTags(inputs),
      Name: `clawql-idp-k3s-${inputs.tenantId ?? "bootstrap"}`,
      "clawql.dev/profile": "idp-k3s",
    },
  });

  const dataVolume = new aws.ebs.Volume("clawql-idp-data", {
    availabilityZone: instance.availabilityZone,
    size: volumeSizeGb,
    type: "gp3",
    encrypted: true,
    tags: {
      ...clawqlTags(inputs),
      Name: `clawql-idp-data-${inputs.tenantId ?? "bootstrap"}`,
    },
  });

  new aws.ec2.VolumeAttachment("clawql-idp-data-attach", {
    deviceName: "/dev/sdf",
    volumeId: dataVolume.id,
    instanceId: instance.id,
  });

  return {
    instanceId: instance.id,
    publicIp: instance.publicIp,
    privateIp: instance.privateIp,
    volumeId: dataVolume.id,
    securityGroupId: sg.id,
    amiId: pulumi.output(amiId),
  };
}

function clawqlTags(inputs: ProvisionInputs): Record<string, string> {
  return {
    ManagedBy: "pulumi",
    ClawQLProfile: "idp-k3s",
    ClawQLTier: inputs.tier,
    ...(inputs.tenantId ? { ClawQLTenant: inputs.tenantId } : {}),
  };
}
