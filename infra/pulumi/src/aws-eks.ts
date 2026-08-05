import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { ProvisionInputs } from "./types.js";

export type AwsEksOutputs = {
  clusterName: pulumi.Output<string>;
  clusterEndpoint: pulumi.Output<string>;
  clusterArn: pulumi.Output<string>;
  oidcIssuer: pulumi.Output<string | undefined>;
  nodeGroupName: pulumi.Output<string>;
  karpenterControllerRoleArn: pulumi.Output<string>;
  karpenterNodeRoleArn: pulumi.Output<string>;
  karpenterGitopsPath: string;
};

/**
 * AWS EKS + Karpenter scaffolding (GTM Phase 3).
 *
 * Creates the control plane, a small on-demand reserved node group, and IAM roles
 * for Karpenter. NodePool / EC2NodeClass CRs and Karpenter Helm live under
 * `deployment/gitops/karpenter/` and sync via Argo CD.
 */
export function createAwsEks(inputs: ProvisionInputs): AwsEksOutputs {
  const clusterName = inputs.eksClusterName ?? `clawql-${inputs.tenantId ?? "prod"}`;
  const version = inputs.eksVersion ?? "1.32";
  const region = inputs.region || "us-east-1";

  const eksRole = new aws.iam.Role("clawql-eks-cluster-role", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "eks.amazonaws.com" },
        },
      ],
    }),
    tags: clawqlTags(inputs),
  });

  new aws.iam.RolePolicyAttachment("clawql-eks-cluster-policy", {
    role: eksRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
  });

  const vpcId = inputs.vpcId
    ? pulumi.output(inputs.vpcId)
    : aws.ec2.getVpcOutput({ default: true }).id;

  const subnetIds = inputs.subnetIds
    ? pulumi.output(inputs.subnetIds)
    : vpcId.apply(
        (id) =>
          aws.ec2.getSubnetsOutput({
            filters: [{ name: "vpc-id", values: [id] }],
          }).ids
      );

  const clusterSg = new aws.ec2.SecurityGroup("clawql-eks-cluster-sg", {
    vpcId,
    description: "ClawQL EKS cluster security group",
    egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
    tags: clawqlTags(inputs),
  });

  const cluster = new aws.eks.Cluster("clawql-eks", {
    name: clusterName,
    roleArn: eksRole.arn,
    version,
    vpcConfig: {
      subnetIds,
      endpointPrivateAccess: true,
      endpointPublicAccess: inputs.eksPublicEndpoint !== false,
      securityGroupIds: [clusterSg.id],
    },
    accessConfig: {
      authenticationMode: "API_AND_CONFIG_MAP",
    },
    enabledClusterLogTypes: ["api", "audit", "authenticator"],
    tags: {
      ...clawqlTags(inputs),
      Name: clusterName,
      "clawql.dev/profile": "eks",
    },
  });

  const oidcIssuer = cluster.identities.apply((ids) => ids?.[0]?.oidcs?.[0]?.issuer);

  // OIDC provider for IRSA (Karpenter + future workload roles)
  const oidcProvider = new aws.iam.OpenIdConnectProvider("clawql-eks-oidc", {
    url: oidcIssuer.apply((iss) => iss ?? "https://oidc.eks.invalid"),
    clientIdLists: ["sts.amazonaws.com"],
    thumbprintLists: ["9e99a48a9960b14926bb7f3b02e22da2b0ab7280"],
  });

  const nodeRole = new aws.iam.Role("clawql-eks-node-role", {
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

  attachEksNodePolicies(nodeRole, "clawql-eks-node");

  const nodeGroup = new aws.eks.NodeGroup(
    "clawql-eks-reserved",
    {
      clusterName: cluster.name,
      nodeRoleArn: nodeRole.arn,
      subnetIds,
      scalingConfig: {
        desiredSize: inputs.eksReservedDesiredSize ?? 2,
        minSize: inputs.eksReservedMinSize ?? 1,
        maxSize: inputs.eksReservedMaxSize ?? 4,
      },
      instanceTypes: [inputs.instanceType || "r7i.xlarge"],
      capacityType: "ON_DEMAND",
      labels: {
        "clawql.dev/pool": "reserved",
      },
      tags: clawqlTags(inputs),
    },
    { dependsOn: [cluster] }
  );

  const caller = aws.getCallerIdentityOutput({});

  const karpenterControllerRole = new aws.iam.Role("clawql-karpenter-controller", {
    assumeRolePolicy: pulumi
      .all([oidcProvider.arn, oidcIssuer, caller.accountId])
      .apply(([providerArn, issuer, accountId]) => {
        const host = (issuer ?? "").replace("https://", "");
        return JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Federated: providerArn },
              Action: "sts:AssumeRoleWithWebIdentity",
              Condition: {
                StringEquals: {
                  [`${host}:aud`]: "sts.amazonaws.com",
                  [`${host}:sub`]: "system:serviceaccount:karpenter:karpenter",
                },
              },
            },
            // Document account for operators
            ...(accountId ? [] : []),
          ],
        });
      }),
    tags: clawqlTags(inputs),
  });

  // Broad EC2/SSM/pricing permissions Karpenter needs — tighten via AWS managed policy later
  new aws.iam.RolePolicy("clawql-karpenter-controller-policy", {
    role: karpenterControllerRole.id,
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "ec2:CreateFleet",
            "ec2:CreateLaunchTemplate",
            "ec2:CreateTags",
            "ec2:Describe*",
            "ec2:RunInstances",
            "ec2:TerminateInstances",
            "pricing:GetProducts",
            "ssm:GetParameter",
            "iam:PassRole",
            "eks:DescribeCluster",
          ],
          Resource: "*",
        },
      ],
    }),
  });

  const karpenterNodeRole = new aws.iam.Role("clawql-karpenter-node", {
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

  attachEksNodePolicies(karpenterNodeRole, "clawql-karpenter-node");

  new aws.iam.InstanceProfile("clawql-karpenter-node-profile", {
    role: karpenterNodeRole.name,
    name: `${clusterName}-karpenter-node`,
  });

  // Tag subnets for Karpenter discovery (when using discovered default VPC)
  void region;

  return {
    clusterName: cluster.name,
    clusterEndpoint: cluster.endpoint,
    clusterArn: cluster.arn,
    oidcIssuer,
    nodeGroupName: nodeGroup.nodeGroupName,
    karpenterControllerRoleArn: karpenterControllerRole.arn,
    karpenterNodeRoleArn: karpenterNodeRole.arn,
    karpenterGitopsPath: "deployment/gitops/karpenter",
  };
}

function attachEksNodePolicies(role: aws.iam.Role, prefix: string): void {
  for (const [name, arn] of [
    ["worker", "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"],
    ["cni", "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"],
    ["ecr", "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"],
    ["ssm", "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"],
  ] as const) {
    new aws.iam.RolePolicyAttachment(`${prefix}-${name}`, {
      role: role.name,
      policyArn: arn,
    });
  }
}

function clawqlTags(inputs: ProvisionInputs): Record<string, string> {
  return {
    ManagedBy: "pulumi",
    ClawQLProfile: "eks",
    ClawQLTier: inputs.tier,
    ...(inputs.tenantId ? { ClawQLTenant: inputs.tenantId } : {}),
  };
}
