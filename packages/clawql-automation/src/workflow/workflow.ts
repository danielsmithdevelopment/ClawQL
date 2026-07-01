/**
 * Optional `workflow` MCP tool — Argo Workflows submit/observe (template-ref only in v1).
 */

import { z } from "zod";
import {
  buildSubmitWorkflowBody,
  mapTemplateListItem,
  mapWorkflowToSummary,
  type WorkflowTemplateRef,
} from "./argo-mapper.js";
import { ARGO_CRD, getWorkflowGenerateNamePrefix, resolveWorkflowNamespace } from "./env.js";
import { getWorkflowK8sClients, readPodLogs, type ArgoWorkflowObject } from "./k8s-client.js";
import {
  getWorkflowLogTailMax,
  isNamespaceAllowed,
  isTemplateAllowed,
  workflowDeleteAllowed,
  workflowToolEnabled,
  WORKFLOW_CORRELATION_LABEL,
} from "./env.js";
import {
  getWorkflowWaitPollSecondsDefault,
  getWorkflowWaitTimeoutSecondsDefault,
  isTerminalWorkflowPhase,
  waitForWorkflow,
} from "./wait.js";
import { resumeWorkflow, suspendWorkflow } from "./suspend-resume.js";
import { maybeNotifyWorkflowTerminal } from "./workflow-notify.js";
import { appendWorkflowAudit } from "./workflow-audit.js";

const templateRefSchema = z.object({
  kind: z.enum(["WorkflowTemplate", "ClusterWorkflowTemplate"]),
  name: z.string().min(1).max(253),
  namespace: z.string().max(63).optional(),
});

export const workflowToolSchema = {
  operation: z
    .enum([
      "submit",
      "get",
      "list",
      "delete",
      "logs",
      "list_templates",
      "wait",
      "suspend",
      "resume",
    ])
    .describe(
      "submit | get | list | delete | logs | list_templates | wait | suspend | resume for Argo Workflows."
    ),
  namespace: z.string().max(63).optional(),
  name: z.string().max(253).optional(),
  generate_name: z
    .string()
    .max(63)
    .optional()
    .describe("Prefix for submit generateName (default clawql-)."),
  template_ref: templateRefSchema.optional(),
  parameters: z.record(z.string(), z.string()).optional(),
  labels: z.record(z.string(), z.string()).optional(),
  correlation_id: z.string().max(128).optional(),
  label_selector: z.string().max(512).optional(),
  phase: z.enum(["Pending", "Running", "Succeeded", "Failed", "Error"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  include_nodes: z.boolean().optional(),
  node_name: z.string().max(253).optional(),
  container: z.string().max(128).optional(),
  tail_lines: z.number().int().min(1).max(500).optional(),
  template_kind: z
    .enum(["WorkflowTemplate", "ClusterWorkflowTemplate", "both"])
    .optional()
    .describe("For list_templates (default both)."),
  timeout_seconds: z
    .number()
    .int()
    .min(1)
    .max(7200)
    .optional()
    .describe(
      "For wait: max seconds to poll (default CLAWQL_WORKFLOW_WAIT_TIMEOUT_SECONDS or 600)."
    ),
  poll_interval_seconds: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional()
    .describe("For wait: seconds between polls (default CLAWQL_WORKFLOW_WAIT_POLL_SECONDS or 5)."),
  node_field_selector: z
    .string()
    .max(512)
    .optional()
    .describe(
      "For resume: optional Argo node-field-selector (e.g. displayName=approve) to resume a specific suspend step."
    ),
};

const workflowInputSchema = z.object(workflowToolSchema).superRefine((data, ctx) => {
  if (data.operation === "submit") {
    if (!data.template_ref) {
      ctx.addIssue({ code: "custom", message: "submit requires template_ref" });
    } else if (
      data.template_ref.kind === "WorkflowTemplate" &&
      !data.template_ref.namespace?.trim() &&
      !data.namespace?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        message: "WorkflowTemplate requires template_ref.namespace or top-level namespace",
      });
    }
    const paramCount = Object.keys(data.parameters ?? {}).length;
    if (paramCount > 32) {
      ctx.addIssue({ code: "custom", message: "parameters must have at most 32 keys" });
    }
    for (const [k, v] of Object.entries(data.parameters ?? {})) {
      if (k.length > 128 || v.length > 4096) {
        ctx.addIssue({
          code: "custom",
          message: "parameter names max 128 chars; values max 4096 chars",
        });
      }
    }
  }
  if (data.operation === "get" || data.operation === "delete" || data.operation === "logs") {
    if (!data.name?.trim()) {
      ctx.addIssue({ code: "custom", message: `${data.operation} requires name` });
    }
  }
  if (data.operation === "wait" || data.operation === "suspend" || data.operation === "resume") {
    if (!data.name?.trim()) {
      ctx.addIssue({ code: "custom", message: `${data.operation} requires name` });
    }
  }
  if (data.operation === "logs" && !data.node_name?.trim()) {
    ctx.addIssue({ code: "custom", message: "logs requires node_name" });
  }
});

function jsonResponse(obj: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

function workflowDisabledResponse(): { content: { type: "text"; text: string }[] } {
  return jsonResponse({
    ok: false,
    error:
      "workflow tool is not enabled. Set CLAWQL_ENABLE_WORKFLOW=1 and configure CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST.",
  });
}

function requireNamespace(
  namespace?: string
): { ok: true; namespace: string } | { ok: false; error: string } {
  const ns = resolveWorkflowNamespace(namespace);
  if (!ns) {
    return {
      ok: false,
      error: "namespace is required (set namespace or CLAWQL_WORKFLOW_DEFAULT_NAMESPACE)",
    };
  }
  if (!isNamespaceAllowed(ns)) {
    return {
      ok: false,
      error: `namespace is not in CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST: ${ns}`,
    };
  }
  return { ok: true, namespace: ns };
}

function resolveTemplateRef(
  ref: z.infer<typeof templateRefSchema>,
  fallbackNamespace?: string
): WorkflowTemplateRef {
  if (ref.kind === "ClusterWorkflowTemplate") {
    return { kind: ref.kind, name: ref.name };
  }
  return {
    kind: ref.kind,
    name: ref.name,
    namespace: ref.namespace?.trim() || fallbackNamespace,
  };
}

function workflowCorrelationId(
  explicit?: string,
  labels?: Record<string, string>
): string | undefined {
  const fromInput = explicit?.trim();
  if (fromInput) return fromInput;
  const fromLabel = labels?.[WORKFLOW_CORRELATION_LABEL]?.trim();
  return fromLabel || undefined;
}

async function getWorkflow(namespace: string, name: string): Promise<ArgoWorkflowObject> {
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

export async function handleWorkflowToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  if (!workflowToolEnabled()) {
    return workflowDisabledResponse();
  }

  const parsed = workflowInputSchema.parse(params);

  try {
    switch (parsed.operation) {
      case "submit": {
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const templateRef = resolveTemplateRef(parsed.template_ref!, nsCheck.namespace);
        if (
          !isTemplateAllowed(
            templateRef.kind,
            templateRef.name,
            templateRef.namespace ?? nsCheck.namespace
          )
        ) {
          return jsonResponse({
            ok: false,
            error: `template is not in CLAWQL_WORKFLOW_TEMPLATE_ALLOWLIST: ${templateRef.name}`,
          });
        }
        const body = buildSubmitWorkflowBody({
          generateName: parsed.generate_name?.trim() || getWorkflowGenerateNamePrefix(),
          namespace: nsCheck.namespace,
          templateRef,
          parameters: parsed.parameters,
          labels: parsed.labels,
          correlationId: parsed.correlation_id,
        });
        const { customObjects } = await getWorkflowK8sClients();
        const created = (await customObjects.createNamespacedCustomObject({
          group: ARGO_CRD.group,
          version: ARGO_CRD.version,
          namespace: nsCheck.namespace,
          plural: ARGO_CRD.workflowPlural,
          body,
        })) as ArgoWorkflowObject;
        const summary = mapWorkflowToSummary(created, nsCheck.namespace);
        appendWorkflowAudit({
          action: "submit",
          summary: `namespace=${nsCheck.namespace} name=${summary.name} phase=${summary.phase} template=${summary.template_ref?.name ?? "unknown"}`,
          correlationId: workflowCorrelationId(parsed.correlation_id, summary.labels),
        });
        return jsonResponse({
          ok: true,
          operation: "submit",
          workflow: summary,
        });
      }
      case "get": {
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const wf = await getWorkflow(nsCheck.namespace, parsed.name!);
        const summary = mapWorkflowToSummary(wf, nsCheck.namespace);
        if (parsed.include_nodes === false) {
          delete summary.nodes;
        }
        if (isTerminalWorkflowPhase(summary.phase)) {
          appendWorkflowAudit({
            action: "terminal",
            summary: `namespace=${nsCheck.namespace} name=${summary.name} phase=${summary.phase}`,
            correlationId: workflowCorrelationId(undefined, summary.labels),
          });
        }
        return jsonResponse({ ok: true, operation: "get", workflow: summary });
      }
      case "wait": {
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const result = await waitForWorkflow({
          namespace: nsCheck.namespace,
          name: parsed.name!,
          timeoutSeconds: parsed.timeout_seconds ?? getWorkflowWaitTimeoutSecondsDefault(),
          pollIntervalSeconds: parsed.poll_interval_seconds ?? getWorkflowWaitPollSecondsDefault(),
          includeNodes: parsed.include_nodes,
          getWorkflow,
        });
        appendWorkflowAudit({
          action: result.timedOut ? "wait_timeout" : "terminal",
          summary: `namespace=${nsCheck.namespace} name=${parsed.name} phase=${result.workflow.phase} timed_out=${result.timedOut} polls=${result.polls}`,
          correlationId: workflowCorrelationId(undefined, result.workflow.labels),
        });
        await maybeNotifyWorkflowTerminal({
          namespace: nsCheck.namespace,
          name: parsed.name!,
          workflow: result.workflow,
          timedOut: result.timedOut,
          waitedSeconds: Math.round(result.waitedMs / 1000),
          polls: result.polls,
        });
        return jsonResponse({
          ok: !result.timedOut,
          operation: "wait",
          workflow: result.workflow,
          waited_seconds: Math.round(result.waitedMs / 1000),
          timed_out: result.timedOut,
          polls: result.polls,
          ...(result.timedOut
            ? {
                error: `workflow did not reach a terminal phase within ${parsed.timeout_seconds ?? getWorkflowWaitTimeoutSecondsDefault()}s (last phase: ${result.workflow.phase})`,
              }
            : {}),
        });
      }
      case "list": {
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const limit = parsed.limit ?? 50;
        const { customObjects } = await getWorkflowK8sClients();
        const res = (await customObjects.listNamespacedCustomObject({
          group: ARGO_CRD.group,
          version: ARGO_CRD.version,
          namespace: nsCheck.namespace,
          plural: ARGO_CRD.workflowPlural,
          labelSelector: parsed.label_selector,
          limit,
        })) as { items?: ArgoWorkflowObject[] };
        let items = res.items ?? [];
        if (parsed.phase) {
          items = items.filter((w) => w.status?.phase === parsed.phase);
        }
        const workflows = items.map((w) => mapWorkflowToSummary(w, nsCheck.namespace));
        return jsonResponse({
          ok: true,
          operation: "list",
          namespace: nsCheck.namespace,
          workflows,
        });
      }
      case "delete": {
        if (!workflowDeleteAllowed()) {
          return jsonResponse({
            ok: false,
            error: "delete is disabled. Set CLAWQL_WORKFLOW_ALLOW_DELETE=1.",
          });
        }
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const { customObjects } = await getWorkflowK8sClients();
        await customObjects.deleteNamespacedCustomObject({
          group: ARGO_CRD.group,
          version: ARGO_CRD.version,
          namespace: nsCheck.namespace,
          plural: ARGO_CRD.workflowPlural,
          name: parsed.name!,
        });
        return jsonResponse({
          ok: true,
          operation: "delete",
          namespace: nsCheck.namespace,
          name: parsed.name,
          deleted: true,
        });
      }
      case "logs": {
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const wf = await getWorkflow(nsCheck.namespace, parsed.name!);
        const nodes = wf.status?.nodes ?? {};
        const node = Object.values(nodes).find(
          (n) =>
            n.displayName === parsed.node_name ||
            n.name === parsed.node_name ||
            n.podName === parsed.node_name
        );
        const podName = node?.podName ?? parsed.node_name!;
        const tail = Math.min(
          parsed.tail_lines ?? getWorkflowLogTailMax(),
          getWorkflowLogTailMax()
        );
        const { coreV1 } = await getWorkflowK8sClients();
        const logText = await readPodLogs(
          coreV1,
          nsCheck.namespace,
          podName,
          tail,
          parsed.container
        );
        return jsonResponse({
          ok: true,
          operation: "logs",
          namespace: nsCheck.namespace,
          workflow: parsed.name,
          node_name: parsed.node_name,
          pod_name: podName,
          tail_lines: tail,
          logs: logText,
        });
      }
      case "list_templates": {
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const kind = parsed.template_kind ?? "both";
        const limit = parsed.limit ?? 50;
        const { customObjects } = await getWorkflowK8sClients();
        const templates: ReturnType<typeof mapTemplateListItem>[] = [];
        if (kind === "WorkflowTemplate" || kind === "both") {
          const res = (await customObjects.listNamespacedCustomObject({
            group: ARGO_CRD.group,
            version: ARGO_CRD.version,
            namespace: nsCheck.namespace,
            plural: ARGO_CRD.workflowTemplatePlural,
            limit,
          })) as { items?: { metadata?: { name?: string; namespace?: string } }[] };
          for (const item of res.items ?? []) {
            const mapped = mapTemplateListItem("WorkflowTemplate", item);
            if (mapped) templates.push(mapped);
          }
        }
        if (kind === "ClusterWorkflowTemplate" || kind === "both") {
          const res = (await customObjects.listClusterCustomObject({
            group: ARGO_CRD.group,
            version: ARGO_CRD.version,
            plural: ARGO_CRD.clusterWorkflowTemplatePlural,
            limit,
          })) as { items?: { metadata?: { name?: string } }[] };
          for (const item of res.items ?? []) {
            const mapped = mapTemplateListItem("ClusterWorkflowTemplate", item);
            if (mapped) templates.push(mapped);
          }
        }
        return jsonResponse({
          ok: true,
          operation: "list_templates",
          namespace: nsCheck.namespace,
          templates: templates.filter(Boolean),
        });
      }
      case "suspend": {
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const wf = await suspendWorkflow(nsCheck.namespace, parsed.name!);
        const summary = mapWorkflowToSummary(wf, nsCheck.namespace);
        appendWorkflowAudit({
          action: "suspend",
          summary: `namespace=${nsCheck.namespace} name=${summary.name} phase=${summary.phase}`,
          correlationId: workflowCorrelationId(undefined, summary.labels),
        });
        return jsonResponse({
          ok: true,
          operation: "suspend",
          workflow: summary,
          suspended: true,
        });
      }
      case "resume": {
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const result = await resumeWorkflow(
          nsCheck.namespace,
          parsed.name!,
          parsed.node_field_selector
        );
        const summary = mapWorkflowToSummary(result.workflow, nsCheck.namespace);
        appendWorkflowAudit({
          action: "resume",
          summary: `namespace=${nsCheck.namespace} name=${summary.name} resumed_nodes=${result.resumed_nodes.join(",") || "workflow-level"} workflow_level=${result.workflow_level_resumed}`,
          correlationId: workflowCorrelationId(undefined, summary.labels),
        });
        return jsonResponse({
          ok: true,
          operation: "resume",
          workflow: summary,
          resumed_nodes: result.resumed_nodes,
          workflow_level_resumed: result.workflow_level_resumed,
        });
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, operation: parsed.operation, error: message });
  }
}
