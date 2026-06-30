/**
 * Map Argo Workflow CRDs to agent-friendly JSON (no secrets / full pod specs).
 */

import type { ArgoWorkflowObject } from "./k8s-client.js";
import { getWorkflowArgoUiBaseUrl } from "./env.js";

export type WorkflowTemplateRef = {
  kind: "WorkflowTemplate" | "ClusterWorkflowTemplate";
  name: string;
  namespace?: string;
};

export type WorkflowNodeSummary = {
  id: string;
  name: string;
  phase: string;
  started_at?: string;
  finished_at?: string;
  pod_name?: string;
};

export type WorkflowSummary = {
  namespace: string;
  name: string;
  uid?: string;
  phase: string;
  started_at?: string;
  finished_at?: string;
  template_ref?: WorkflowTemplateRef;
  parameters?: Record<string, string>;
  labels?: Record<string, string>;
  nodes?: WorkflowNodeSummary[];
  links?: { argo_ui?: string };
};

export type WorkflowTemplateSummary = {
  kind: "WorkflowTemplate" | "ClusterWorkflowTemplate";
  namespace?: string;
  name: string;
  created_at?: string;
};

function workflowName(w: ArgoWorkflowObject): string {
  return w.metadata?.name ?? w.metadata?.generateName ?? "";
}

function extractParameters(w: ArgoWorkflowObject): Record<string, string> | undefined {
  const params = w.spec?.arguments?.parameters;
  if (!params?.length) return undefined;
  const out: Record<string, string> = {};
  for (const p of params) {
    if (p.name && p.value !== undefined) out[p.name] = p.value;
  }
  return Object.keys(out).length ? out : undefined;
}

function extractTemplateRef(w: ArgoWorkflowObject): WorkflowTemplateRef | undefined {
  const ref = w.spec?.workflowTemplateRef;
  if (!ref?.name) return undefined;
  if (ref.clusterScope) {
    return { kind: "ClusterWorkflowTemplate", name: ref.name };
  }
  return {
    kind: "WorkflowTemplate",
    name: ref.name,
    namespace: w.metadata?.namespace,
  };
}

function summarizeNodes(w: ArgoWorkflowObject): WorkflowNodeSummary[] | undefined {
  const nodes = w.status?.nodes;
  if (!nodes) return undefined;
  const out: WorkflowNodeSummary[] = [];
  for (const [id, node] of Object.entries(nodes)) {
    if (node.type === "Pod" || node.podName) {
      out.push({
        id,
        name: node.displayName ?? node.name ?? id,
        phase: node.phase ?? "Unknown",
        started_at: node.startedAt,
        finished_at: node.finishedAt,
        pod_name: node.podName,
      });
    }
  }
  return out.length ? out : undefined;
}

export function mapWorkflowToSummary(
  w: ArgoWorkflowObject,
  namespace: string
): WorkflowSummary {
  const name = workflowName(w);
  const baseUrl = getWorkflowArgoUiBaseUrl();
  const links =
    baseUrl && name
      ? { argo_ui: `${baseUrl}/workflows/${namespace}/${name}` }
      : undefined;
  return {
    namespace,
    name,
    uid: w.metadata?.uid,
    phase: w.status?.phase ?? "Unknown",
    started_at: w.status?.startedAt,
    finished_at: w.status?.finishedAt,
    template_ref: extractTemplateRef(w),
    parameters: extractParameters(w),
    labels: w.metadata?.labels,
    nodes: summarizeNodes(w),
    links,
  };
}

export function mapTemplateListItem(
  kind: "WorkflowTemplate" | "ClusterWorkflowTemplate",
  item: {
    metadata?: { name?: string; namespace?: string; creationTimestamp?: string };
  }
): WorkflowTemplateSummary | null {
  const name = item.metadata?.name;
  if (!name) return null;
  return {
    kind,
    name,
    namespace: kind === "WorkflowTemplate" ? item.metadata?.namespace : undefined,
    created_at: item.metadata?.creationTimestamp,
  };
}

export function buildSubmitWorkflowBody(input: {
  generateName: string;
  namespace: string;
  templateRef: WorkflowTemplateRef;
  parameters?: Record<string, string>;
  labels?: Record<string, string>;
  correlationId?: string;
}): Record<string, unknown> {
  const labels: Record<string, string> = {
    "clawql.dev/managed": "true",
    ...input.labels,
  };
  if (input.correlationId?.trim()) {
    labels["clawql.dev/correlation-id"] = input.correlationId.trim().slice(0, 128);
  }

  const parameters = Object.entries(input.parameters ?? {}).map(([name, value]) => ({
    name,
    value: String(value),
  }));

  const workflowTemplateRef: Record<string, unknown> = {
    name: input.templateRef.name,
  };
  if (input.templateRef.kind === "ClusterWorkflowTemplate") {
    workflowTemplateRef.clusterScope = true;
  }

  return {
    apiVersion: "argoproj.io/v1alpha1",
    kind: "Workflow",
    metadata: {
      generateName: input.generateName,
      namespace: input.namespace,
      labels,
    },
    spec: {
      workflowTemplateRef,
      arguments: parameters.length ? { parameters } : undefined,
    },
  };
}
