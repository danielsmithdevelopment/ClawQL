/**
 * Kubernetes client factory for Argo Workflows CRDs (`@kubernetes/client-node`).
 * Domain APIs are Effect-primary; thin Promise façades for workflow tool edges.
 */

import { CoreV1Api, CustomObjectsApi, KubeConfig, type V1Pod } from "@kubernetes/client-node";
import { Context, Effect, Layer } from "effect";
import { getWorkflowKubeconfigPath } from "./env.js";
import { automationFromPromise } from "../effect/automation-effect-utils.js";
import { AutomationError } from "../effect/automation-errors.js";

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

function loadKubeConfigEffect(): Effect.Effect<KubeConfig, AutomationError> {
  return Effect.try({
    try: () => {
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
    },
    catch: (cause) =>
      new AutomationError({
        reason: "failed to load kubeconfig",
        cause,
      }),
  });
}

export function getWorkflowK8sClientsEffect(): Effect.Effect<WorkflowK8sClients, AutomationError> {
  return Effect.gen(function* () {
    if (createClientsOverride) {
      return yield* automationFromPromise(() => createClientsOverride!());
    }
    if (!clientsPromise) {
      clientsPromise = Effect.runPromise(
        Effect.gen(function* () {
          const kc = yield* loadKubeConfigEffect();
          return {
            customObjects: kc.makeApiClient(CustomObjectsApi),
            coreV1: kc.makeApiClient(CoreV1Api),
          };
        })
      );
    }
    return yield* automationFromPromise(() => clientsPromise!);
  });
}

/** Promise façade. */
export async function getWorkflowK8sClients(): Promise<WorkflowK8sClients> {
  return Effect.runPromise(getWorkflowK8sClientsEffect());
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
    suspend?: boolean;
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
    nodes?: Record<string, ArgoWorkflowNodeStatus>;
  };
};

export type ArgoWorkflowNodeStatus = {
  displayName?: string;
  name?: string;
  phase?: string;
  startedAt?: string;
  finishedAt?: string;
  type?: string;
  id?: string;
  podName?: string;
  message?: string;
  templateName?: string;
  templateRef?: { name?: string; template?: string };
  inputs?: { parameters?: { name: string; value?: string }[] };
  outputs?: { parameters?: { name: string; value?: string; valueFrom?: { default?: string } }[] };
};

export function readPodLogsEffect(
  coreV1: CoreV1Api,
  namespace: string,
  podName: string,
  tailLines: number,
  container?: string
): Effect.Effect<string, AutomationError> {
  return automationFromPromise(async () => {
    const res = await coreV1.readNamespacedPodLog({
      name: podName,
      namespace,
      tailLines,
      container,
    });
    return typeof res === "string" ? res : String(res);
  });
}

/** Promise façade. */
export async function readPodLogs(
  coreV1: CoreV1Api,
  namespace: string,
  podName: string,
  tailLines: number,
  container?: string
): Promise<string> {
  return Effect.runPromise(readPodLogsEffect(coreV1, namespace, podName, tailLines, container));
}

export function findWorkflowPods(workflow: ArgoWorkflowObject): V1Pod[] {
  void workflow;
  return [];
}

/** Effect service for K8s client acquisition used by workflow suspend/resume. */
export class WorkflowK8sService extends Context.Service<
  WorkflowK8sService,
  {
    readonly clients: () => Effect.Effect<WorkflowK8sClients, AutomationError>;
  }
>()("clawql/WorkflowK8sService") {}

export function workflowK8sLiveLayer(): Layer.Layer<WorkflowK8sService> {
  return Layer.succeed(
    WorkflowK8sService,
    WorkflowK8sService.of({
      clients: getWorkflowK8sClientsEffect,
    })
  );
}
