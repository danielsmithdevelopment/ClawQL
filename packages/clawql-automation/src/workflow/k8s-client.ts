/**
 * Kubernetes client factory for Argo Workflows CRDs (`@kubernetes/client-node`).
 */

import { CoreV1Api, CustomObjectsApi, KubeConfig, type V1Pod } from "@kubernetes/client-node";
import { getWorkflowKubeconfigPath } from "./env.js";

export type WorkflowK8sClients = {
  customObjects: CustomObjectsApi;
  coreV1: CoreV1Api;
};

let clientsPromise: Promise<WorkflowK8sClients> | null = null;
let createClientsOverride: (() => Promise<WorkflowK8sClients>) | null = null;

export function configureWorkflowK8sFactory(
  factory: (() => Promise<WorkflowK8sClients>) | null
): void {
  createClientsOverride = factory;
  clientsPromise = null;
}

async function loadKubeConfig(): Promise<KubeConfig> {
  const kc = new KubeConfig();
  const kubeconfigPath = getWorkflowKubeconfigPath();
  if (kubeconfigPath) {
    kc.loadFromFile(kubeconfigPath);
  } else {
    try {
      kc.loadFromCluster();
    } catch {
      kc.loadFromDefault();
    }
  }
  return kc;
}

export async function getWorkflowK8sClients(): Promise<WorkflowK8sClients> {
  if (createClientsOverride) {
    return createClientsOverride();
  }
  if (!clientsPromise) {
    clientsPromise = (async () => {
      const kc = await loadKubeConfig();
      return {
        customObjects: kc.makeApiClient(CustomObjectsApi),
        coreV1: kc.makeApiClient(CoreV1Api),
      };
    })();
  }
  return clientsPromise;
}

export function resetWorkflowK8sClientsForTests(): void {
  clientsPromise = null;
  createClientsOverride = null;
}

export type ArgoWorkflowObject = {
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    generateName?: string;
    labels?: Record<string, string>;
    creationTimestamp?: string;
  };
  spec?: {
    arguments?: { parameters?: { name: string; value?: string }[] };
    workflowTemplateRef?: {
      name?: string;
      template?: string;
      clusterScope?: boolean;
    };
  };
  status?: {
    phase?: string;
    startedAt?: string;
    finishedAt?: string;
    nodes?: Record<
      string,
      {
        displayName?: string;
        name?: string;
        phase?: string;
        startedAt?: string;
        finishedAt?: string;
        type?: string;
        id?: string;
        podName?: string;
      }
    >;
  };
};

export async function readPodLogs(
  coreV1: CoreV1Api,
  namespace: string,
  podName: string,
  tailLines: number,
  container?: string
): Promise<string> {
  const res = await coreV1.readNamespacedPodLog({
    name: podName,
    namespace,
    tailLines,
    container,
  });
  return typeof res === "string" ? res : String(res);
}

export function findWorkflowPods(workflow: ArgoWorkflowObject): V1Pod[] {
  void workflow;
  return [];
}
