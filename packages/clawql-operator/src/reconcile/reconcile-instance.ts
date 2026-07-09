import type {
  ClawQLInstanceSpecV1Alpha1,
  ClawQLInstanceStatusV1Alpha1,
} from "../spec/clawql-instance-v1alpha1.js";
import { parseClawqlInstanceSpec } from "../spec/clawql-instance-v1alpha1.js";
import {
  buildTierSpecConfigMapData,
  serializeTierSpecConfigMap,
  tierSpecConfigMapName,
} from "./tier-spec-configmap.js";
import { resolveMcpRolloutTarget, type McpRolloutTarget } from "./mcp-rollout.js";
import {
  checkProviderSecret,
  DEFAULT_PROVIDER_SECRET_NAME,
  type AuthExpectationsPayload,
} from "./auth-expectations.js";

export const CLAWQL_INSTANCE_CRD = {
  group: "clawql.io",
  version: "v1alpha1",
  plural: "clawqlinstances",
} as const;

export type ClawQLInstanceObject = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    generation?: number;
    uid?: string;
  };
  spec?: unknown;
  status?: ClawQLInstanceStatusV1Alpha1;
};

export type ReconcileCoreV1 = {
  readNamespacedConfigMap(
    name: string,
    namespace: string
  ): Promise<{ data?: Record<string, string> }>;
  readNamespacedSecret(
    name: string,
    namespace: string
  ): Promise<{ data?: Record<string, string> }>;
  createNamespacedConfigMap(
    namespace: string,
    body: {
      metadata: { name: string; labels: Record<string, string> };
      data: Record<string, string>;
    }
  ): Promise<unknown>;
  replaceNamespacedConfigMap(
    name: string,
    namespace: string,
    body: {
      metadata: { name: string; labels: Record<string, string> };
      data: Record<string, string>;
    }
  ): Promise<unknown>;
};

export type ReconcileResult = {
  status: ClawQLInstanceStatusV1Alpha1;
  mcpRollout?: McpRolloutTarget;
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function reconcileClawqlInstance(
  instance: ClawQLInstanceObject,
  core: ReconcileCoreV1
): Promise<ReconcileResult> {
  const name = instance.metadata.name;
  const namespace = instance.metadata.namespace;
  const generation = instance.metadata.generation ?? 0;
  let spec: ClawQLInstanceSpecV1Alpha1;
  try {
    spec = parseClawqlInstanceSpec(instance.spec ?? {});
  } catch (err) {
    return {
      status: {
        phase: "Degraded",
        observedGeneration: generation,
        message: err instanceof Error ? err.message : String(err),
        conditions: [
          {
            type: "Validated",
            status: "False",
            reason: "InvalidSpec",
            message: err instanceof Error ? err.message : String(err),
            lastTransitionTime: nowIso(),
          },
        ],
      },
    };
  }

  const cmName = tierSpecConfigMapName(name);
  const providerSecretName = spec.mcp?.providerSecretName ?? DEFAULT_PROVIDER_SECRET_NAME;
  const cmData = buildTierSpecConfigMapData(name, namespace, spec, providerSecretName);
  const serialized = serializeTierSpecConfigMap(cmData);
  const authExpectations = cmData.authExpectations;
  const labels = {
    "app.kubernetes.io/name": "clawql-operator",
    "app.kubernetes.io/managed-by": "clawql-operator",
    "clawql.io/instance": name,
  };
  const metadata: {
    name: string;
    labels: Record<string, string>;
    ownerReferences?: Array<{
      apiVersion: string;
      kind: string;
      name: string;
      uid: string;
      controller?: boolean;
      blockOwnerDeletion?: boolean;
    }>;
  } = { name: cmName, labels };
  if (instance.metadata.uid) {
    metadata.ownerReferences = [
      {
        apiVersion: `${CLAWQL_INSTANCE_CRD.group}/${CLAWQL_INSTANCE_CRD.version}`,
        kind: "ClawQLInstance",
        name,
        uid: instance.metadata.uid,
        controller: true,
        blockOwnerDeletion: true,
      },
    ];
  }
  const body = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata,
    data: serialized,
  };

  try {
    await core.readNamespacedConfigMap(cmName, namespace);
    await core.replaceNamespacedConfigMap(cmName, namespace, body);
  } catch (err: unknown) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode?: number }).statusCode
        : undefined;
    if (statusCode === 404) {
      await core.createNamespacedConfigMap(namespace, body);
    } else {
      throw err;
    }
  }

  const authStatus = await reconcileProviderSecrets(namespace, authExpectations, core);
  const conditions: NonNullable<ClawQLInstanceStatusV1Alpha1["conditions"]> = [
    {
      type: "Validated",
      status: "True",
      reason: "SpecValid",
      lastTransitionTime: nowIso(),
    },
    {
      type: "TierSpecPublished",
      status: "True",
      reason: "ConfigMapReady",
      message: cmName,
      lastTransitionTime: nowIso(),
    },
    {
      type: "ProviderSecretsReady",
      status: authStatus.ready ? "True" : "False",
      reason: authStatus.ready ? "AllKeysPresent" : authStatus.secretExists ? "MissingKeys" : "SecretNotFound",
      message: authStatus.ready
        ? providerSecretName
        : authStatus.missing.length > 0
          ? `Missing: ${authStatus.missing.join(", ")}`
          : `Secret ${providerSecretName} not found`,
      lastTransitionTime: nowIso(),
    },
  ];

  return {
    status: {
      phase: authStatus.ready ? "Ready" : "Degraded",
      observedGeneration: generation,
      configMapName: cmName,
      message: authStatus.ready
        ? "Tier spec ConfigMap reconciled; provider secrets present"
        : `Tier spec published; provider secret ${providerSecretName} incomplete`,
      conditions,
    },
    mcpRollout: resolveMcpRolloutTarget(namespace, name, spec),
  };
}

async function reconcileProviderSecrets(
  namespace: string,
  expectations: AuthExpectationsPayload,
  core: ReconcileCoreV1
) {
  try {
    const secret = await core.readNamespacedSecret(
      expectations.providerSecretName,
      namespace
    );
    return checkProviderSecret(secret.data, expectations);
  } catch (err: unknown) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode?: number }).statusCode
        : undefined;
    if (statusCode === 404) {
      return checkProviderSecret(undefined, expectations);
    }
    throw err;
  }
}
