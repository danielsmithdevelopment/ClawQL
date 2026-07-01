/**
 * CronWorkflow helpers — template-ref schedules for the `workflow` MCP tool.
 */

import type { WorkflowTemplateRef } from "./argo-mapper.js";
import { WORKFLOW_CORRELATION_LABEL, WORKFLOW_MANAGED_LABEL } from "./env.js";

export type ArgoCronWorkflowObject = {
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    labels?: Record<string, string>;
    creationTimestamp?: string;
  };
  spec?: {
    schedule?: string;
    timezone?: string;
    suspend?: boolean;
    workflowSpec?: {
      arguments?: { parameters?: { name: string; value?: string }[] };
      workflowTemplateRef?: {
        name?: string;
        clusterScope?: boolean;
      };
    };
  };
  status?: {
    lastScheduledTime?: string;
    active?: { name?: string; namespace?: string }[];
  };
};

export type CronWorkflowSummary = {
  namespace: string;
  name: string;
  uid?: string;
  schedule?: string;
  timezone?: string;
  suspended?: boolean;
  template_ref?: WorkflowTemplateRef;
  parameters?: Record<string, string>;
  labels?: Record<string, string>;
  last_scheduled_at?: string;
  active_workflows?: string[];
};

function extractCronParameters(cron: ArgoCronWorkflowObject): Record<string, string> | undefined {
  const params = cron.spec?.workflowSpec?.arguments?.parameters;
  if (!params?.length) return undefined;
  const out: Record<string, string> = {};
  for (const p of params) {
    if (p.name && p.value !== undefined) out[p.name] = p.value;
  }
  return Object.keys(out).length ? out : undefined;
}

function extractCronTemplateRef(cron: ArgoCronWorkflowObject): WorkflowTemplateRef | undefined {
  const ref = cron.spec?.workflowSpec?.workflowTemplateRef;
  if (!ref?.name) return undefined;
  if (ref.clusterScope) {
    return { kind: "ClusterWorkflowTemplate", name: ref.name };
  }
  return {
    kind: "WorkflowTemplate",
    name: ref.name,
    namespace: cron.metadata?.namespace,
  };
}

export function mapCronWorkflowToSummary(
  cron: ArgoCronWorkflowObject,
  namespace: string
): CronWorkflowSummary {
  const name = cron.metadata?.name ?? "";
  return {
    namespace,
    name,
    uid: cron.metadata?.uid,
    schedule: cron.spec?.schedule,
    timezone: cron.spec?.timezone,
    suspended: cron.spec?.suspend === true || undefined,
    template_ref: extractCronTemplateRef(cron),
    parameters: extractCronParameters(cron),
    labels: cron.metadata?.labels,
    last_scheduled_at: cron.status?.lastScheduledTime,
    active_workflows: cron.status?.active?.map((a) => a.name).filter(Boolean) as
      | string[]
      | undefined,
  };
}

export function buildSubmitCronWorkflowBody(input: {
  name: string;
  namespace: string;
  schedule: string;
  timezone?: string;
  templateRef: WorkflowTemplateRef;
  parameters?: Record<string, string>;
  labels?: Record<string, string>;
  correlationId?: string;
  suspend?: boolean;
}): Record<string, unknown> {
  const labels: Record<string, string> = {
    [WORKFLOW_MANAGED_LABEL]: "true",
    ...input.labels,
  };
  if (input.correlationId?.trim()) {
    labels[WORKFLOW_CORRELATION_LABEL] = input.correlationId.trim().slice(0, 128);
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
    kind: "CronWorkflow",
    metadata: {
      name: input.name,
      namespace: input.namespace,
      labels,
    },
    spec: {
      schedule: input.schedule,
      timezone: input.timezone || "UTC",
      suspend: input.suspend === true,
      workflowSpec: {
        workflowTemplateRef,
        arguments: parameters.length ? { parameters } : undefined,
      },
    },
  };
}
