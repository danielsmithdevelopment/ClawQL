/**
 * Argo Workflows suspend / resume — workflow-level and suspend-template (HITL) nodes.
 * Mirrors argo-workflows `SuspendWorkflow` / `ResumeWorkflow` via the Workflow CRD API.
 */

import { ARGO_CRD, isNamespaceAllowed, workflowToolEnabled } from "./env.js";
import { getWorkflowK8sClients, type ArgoWorkflowNodeStatus, type ArgoWorkflowObject } from "./k8s-client.js";
import { isTerminalWorkflowPhase } from "./wait.js";

export function isActiveSuspendNode(node: ArgoWorkflowNodeStatus): boolean {
  return node.type === "Suspend" && node.phase === "Running";
}

export function workflowHasActiveSuspend(wf: ArgoWorkflowObject): boolean {
  if (wf.spec?.suspend === true) return true;
  return Object.values(wf.status?.nodes ?? {}).some(isActiveSuspendNode);
}

function nodeTemplateName(node: ArgoWorkflowNodeStatus): string | undefined {
  if (node.templateName) return node.templateName;
  return node.templateRef?.template ?? node.templateRef?.name;
}

/** Simplified Argo `node-field-selector` matching (displayName, name, id, phase, templateName, inputs.parameters.*). */
export function nodeMatchesFieldSelector(
  selector: string,
  node: ArgoWorkflowNodeStatus,
  nodeId: string
): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return true;

  const fields: Record<string, string> = {
    displayName: node.displayName ?? "",
    name: node.name ?? "",
    id: node.id ?? nodeId,
    phase: node.phase ?? "",
    templateName: nodeTemplateName(node) ?? "",
  };
  if (node.templateRef?.name) fields["templateRef.name"] = node.templateRef.name;
  if (node.templateRef?.template) fields["templateRef.template"] = node.templateRef.template;
  for (const param of node.inputs?.parameters ?? []) {
    if (param.name) {
      fields[`inputs.parameters.${param.name}.value`] = param.value ?? "";
    }
  }

  for (const part of trimmed.split(",")) {
    const clause = part.trim();
    if (!clause) continue;
    const eq = clause.indexOf("=");
    if (eq <= 0) return false;
    const key = clause.slice(0, eq).trim();
    const value = clause.slice(eq + 1).trim();
    if ((fields[key] ?? "") !== value) return false;
  }
  return true;
}

async function getWorkflowObject(namespace: string, name: string): Promise<ArgoWorkflowObject> {
  const { customObjects } = await getWorkflowK8sClients();
  const res = await customObjects.getNamespacedCustomObject({
    group: ARGO_CRD.group,
    version: ARGO_CRD.version,
    namespace,
    plural: ARGO_CRD.workflowPlural,
    name,
  });
  return res as ArgoWorkflowObject;
}

async function replaceWorkflowObject(
  namespace: string,
  name: string,
  body: ArgoWorkflowObject
): Promise<ArgoWorkflowObject> {
  const { customObjects } = await getWorkflowK8sClients();
  const res = await customObjects.replaceNamespacedCustomObject({
    group: ARGO_CRD.group,
    version: ARGO_CRD.version,
    namespace,
    plural: ARGO_CRD.workflowPlural,
    name,
    body,
  });
  return res as ArgoWorkflowObject;
}

export async function suspendWorkflow(namespace: string, name: string): Promise<ArgoWorkflowObject> {
  const wf = await getWorkflowObject(namespace, name);
  if (isTerminalWorkflowPhase(wf.status?.phase)) {
    throw new Error(`workflow ${name} is already completed (phase: ${wf.status?.phase})`);
  }
  if (wf.spec?.suspend === true) {
    return wf;
  }
  const updated: ArgoWorkflowObject = {
    ...wf,
    spec: { ...wf.spec, suspend: true },
  };
  return replaceWorkflowObject(namespace, name, updated);
}

export type ResumeWorkflowResult = {
  workflow: ArgoWorkflowObject;
  resumed_nodes: string[];
  workflow_level_resumed: boolean;
};

export async function resumeWorkflow(
  namespace: string,
  name: string,
  nodeFieldSelector?: string
): Promise<ResumeWorkflowResult> {
  const wf = await getWorkflowObject(namespace, name);
  const selector = nodeFieldSelector?.trim() ?? "";
  const resumedNodes: string[] = [];
  let workflowLevelResumed = false;
  let workflowUpdated = false;

  const next: ArgoWorkflowObject = {
    ...wf,
    spec: wf.spec ? { ...wf.spec } : {},
    status: wf.status
      ? {
          ...wf.status,
          nodes: wf.status.nodes ? { ...wf.status.nodes } : undefined,
        }
      : undefined,
  };

  if (next.spec?.suspend === true) {
    next.spec.suspend = false;
    workflowLevelResumed = true;
    workflowUpdated = true;
  }

  for (const [nodeId, node] of Object.entries(next.status?.nodes ?? {})) {
    if (!isActiveSuspendNode(node)) continue;
    if (selector && !nodeMatchesFieldSelector(selector, node, nodeId)) continue;

    const finishedAt = new Date().toISOString();
    const updatedNode: ArgoWorkflowNodeStatus = {
      ...node,
      phase: "Succeeded",
      message: node.message ? `${node.message}; Resumed by clawql workflow tool` : "Resumed by clawql workflow tool",
      finishedAt,
    };
    next.status!.nodes![nodeId] = updatedNode;
    resumedNodes.push(node.displayName ?? node.name ?? nodeId);
    workflowUpdated = true;
  }

  if (!workflowUpdated) {
    if (!workflowHasActiveSuspend(wf)) {
      throw new Error(`workflow ${name} has no active suspend state to resume`);
    }
    if (selector) {
      throw new Error(`no active suspend node matched node_field_selector: ${selector}`);
    }
    throw new Error(`workflow ${name} has no active suspend state to resume`);
  }

  const saved = await replaceWorkflowObject(namespace, name, next);
  return {
    workflow: saved,
    resumed_nodes: resumedNodes,
    workflow_level_resumed: workflowLevelResumed,
  };
}

export type HitlWorkflowRef = {
  namespace: string;
  name: string;
  node_field_selector?: string;
};

export function parseHitlWorkflowRef(hitl: unknown): HitlWorkflowRef | undefined {
  if (!hitl || typeof hitl !== "object") return undefined;
  const o = hitl as Record<string, unknown>;
  const direct = o.workflow;
  if (direct && typeof direct === "object") {
    const w = direct as Record<string, unknown>;
    const ns = typeof w.namespace === "string" ? w.namespace.trim() : "";
    const wfName = typeof w.name === "string" ? w.name.trim() : "";
    if (ns && wfName) {
      return {
        namespace: ns,
        name: wfName,
        node_field_selector:
          typeof w.node_field_selector === "string" ? w.node_field_selector.trim() : undefined,
      };
    }
  }
  const prov = o.provenance;
  if (prov && typeof prov === "object") {
    const p = prov as Record<string, unknown>;
    const ns =
      typeof p.workflow_namespace === "string"
        ? p.workflow_namespace.trim()
        : typeof p.namespace === "string"
          ? p.namespace.trim()
          : "";
    const wfName =
      typeof p.workflow_name === "string"
        ? p.workflow_name.trim()
        : typeof p.name === "string"
          ? p.name.trim()
          : "";
    if (ns && wfName) {
      return {
        namespace: ns,
        name: wfName,
        node_field_selector:
          typeof p.node_field_selector === "string" ? p.node_field_selector.trim() : undefined,
      };
    }
  }
  return undefined;
}

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function hitlWebhookResumeWorkflowEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_HITL_WEBHOOK_RESUME_WORKFLOW);
}

export type HitlWebhookResumeResult =
  | { attempted: false }
  | { attempted: true; ok: true; resumed_nodes: string[]; workflow_level_resumed: boolean }
  | { attempted: true; ok: false; error: string };

/** Resume an Argo workflow when Label Studio webhook completes (opt-in). */
export async function maybeResumeWorkflowFromHitl(
  hitl: unknown
): Promise<HitlWebhookResumeResult> {
  if (!hitlWebhookResumeWorkflowEnabled()) return { attempted: false };
  if (!workflowToolEnabled()) {
    return { attempted: true, ok: false, error: "workflow tool is not enabled" };
  }
  const ref = parseHitlWorkflowRef(hitl);
  if (!ref) return { attempted: false };
  if (!isNamespaceAllowed(ref.namespace)) {
    return {
      attempted: true,
      ok: false,
      error: `workflow namespace not in allowlist: ${ref.namespace}`,
    };
  }
  try {
    const result = await resumeWorkflow(ref.namespace, ref.name, ref.node_field_selector);
    return {
      attempted: true,
      ok: true,
      resumed_nodes: result.resumed_nodes,
      workflow_level_resumed: result.workflow_level_resumed,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { attempted: true, ok: false, error: message };
  }
}
