import {
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
  type V1ConfigMap,
  Watch,
} from "@kubernetes/client-node";
import {
  CLAWQL_INSTANCE_CRD,
  reconcileClawqlInstance,
  type ClawQLInstanceObject,
} from "../reconcile/reconcile-instance.js";

export type RunOperatorOptions = {
  readonly namespace?: string;
  readonly instanceName?: string;
  readonly once?: boolean;
  readonly log?: (message: string) => void;
};

function defaultLog(message: string): void {
  process.stderr.write(`[clawql-operator] ${message}\n`);
}

function loadKubeConfig(): KubeConfig {
  const kc = new KubeConfig();
  try {
    kc.loadFromCluster();
  } catch {
    kc.loadFromDefault();
  }
  return kc;
}

export async function runOperator(options: RunOperatorOptions = {}): Promise<void> {
  const log = options.log ?? defaultLog;
  const kc = loadKubeConfig();
  const customObjects = kc.makeApiClient(CustomObjectsApi);
  const core = kc.makeApiClient(CoreV1Api);

  const reconcileCore = {
    readNamespacedConfigMap: (name: string, namespace: string) =>
      core.readNamespacedConfigMap({ name, namespace }),
    createNamespacedConfigMap: (namespace: string, body: V1ConfigMap) =>
      core.createNamespacedConfigMap({ namespace, body }),
    replaceNamespacedConfigMap: (name: string, namespace: string, body: V1ConfigMap) =>
      core.replaceNamespacedConfigMap({ name, namespace, body }),
  };

  const reconcileOne = async (instance: ClawQLInstanceObject) => {
    if (options.namespace && instance.metadata.namespace !== options.namespace) return;
    if (options.instanceName && instance.metadata.name !== options.instanceName) return;
    log(`reconciling ${instance.metadata.namespace}/${instance.metadata.name}`);
    const result = await reconcileClawqlInstance(instance, reconcileCore);
    await customObjects.patchNamespacedCustomObjectStatus({
      group: CLAWQL_INSTANCE_CRD.group,
      version: CLAWQL_INSTANCE_CRD.version,
      namespace: instance.metadata.namespace,
      plural: CLAWQL_INSTANCE_CRD.plural,
      name: instance.metadata.name,
      body: result.status,
    });
    log(`status=${result.status.phase} configMap=${result.status.configMapName ?? "none"}`);
  };

  const list = await customObjects.listClusterCustomObject({
    group: CLAWQL_INSTANCE_CRD.group,
    version: CLAWQL_INSTANCE_CRD.version,
    plural: CLAWQL_INSTANCE_CRD.plural,
  });
  const items = ((list as { items?: ClawQLInstanceObject[] }).items ??
    []) as ClawQLInstanceObject[];
  for (const instance of items) {
    await reconcileOne(instance);
  }

  if (options.once) {
    log("reconcile complete (--once)");
    return;
  }

  const watch = new Watch(kc);
  const path = `/apis/${CLAWQL_INSTANCE_CRD.group}/${CLAWQL_INSTANCE_CRD.version}/${CLAWQL_INSTANCE_CRD.plural}`;
  await new Promise<void>((resolve, reject) => {
    watch.watch(
      path,
      {},
      async (type, obj) => {
        if (type === "ADDED" || type === "MODIFIED") {
          try {
            await reconcileOne(obj as ClawQLInstanceObject);
          } catch (err) {
            log(`reconcile error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}
