import type { ClawQLInstanceSpecV1Alpha1 } from "../spec/clawql-instance-v1alpha1.js";

export type McpRolloutTarget = {
  deploymentName: string;
  namespace: string;
};

export function resolveMcpRolloutTarget(
  instanceNamespace: string,
  instanceName: string,
  spec: ClawQLInstanceSpecV1Alpha1
): McpRolloutTarget | undefined {
  const mcp = spec.mcp;
  if (!mcp?.rolloutOnTierSpecChange) return undefined;
  const deploymentName = mcp.deploymentName?.trim() || "clawql-mcp-http";
  const namespace = mcp.namespace?.trim() || instanceNamespace;
  return { deploymentName, namespace };
}

export type AppsV1PatchDeployment = {
  patchNamespacedDeployment(request: {
    name: string;
    namespace: string;
    body: unknown;
    fieldManager?: string;
    force?: boolean;
  }): Promise<unknown>;
};

/** Trigger rolling restart via pod template annotation (same pattern as kubectl rollout restart). */
export async function rolloutMcpDeployment(
  target: McpRolloutTarget,
  apps: AppsV1PatchDeployment
): Promise<void> {
  const restartedAt = new Date().toISOString();
  const patch = {
    spec: {
      template: {
        metadata: {
          annotations: {
            "clawql.io/instance-spec-restartedAt": restartedAt,
          },
        },
      },
    },
  };
  await apps.patchNamespacedDeployment({
    name: target.deploymentName,
    namespace: target.namespace,
    body: patch,
    fieldManager: "clawql-operator",
    force: true,
  });
}
