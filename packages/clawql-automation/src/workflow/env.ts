/**
 * Environment configuration for the optional `workflow` MCP tool (Argo Workflows).
 */

const ARGO_GROUP = "argoproj.io";
const ARGO_VERSION = "v1alpha1";

export const ARGO_CRD = {
  group: ARGO_GROUP,
  version: ARGO_VERSION,
  workflowPlural: "workflows",
  workflowTemplatePlural: "workflowtemplates",
  clusterWorkflowTemplatePlural: "clusterworkflowtemplates",
} as const;

/** Minimum supported Argo Workflows release (see docs/design/workflow-tool-argo.md). */
export const MIN_ARGO_WORKFLOWS_VERSION = "3.4.0";

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function workflowToolEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_ENABLE_WORKFLOW);
}

export function getWorkflowNamespaceAllowlist(): string[] {
  const raw = process.env.CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST?.trim();
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function getWorkflowDefaultNamespace(): string | undefined {
  const v = process.env.CLAWQL_WORKFLOW_DEFAULT_NAMESPACE?.trim();
  return v || undefined;
}

export function getWorkflowTemplateAllowlist(): string[] {
  const raw = process.env.CLAWQL_WORKFLOW_TEMPLATE_ALLOWLIST?.trim();
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function getWorkflowKubeconfigPath(): string | undefined {
  const v = process.env.CLAWQL_WORKFLOW_KUBECONFIG?.trim();
  return v || undefined;
}

export function getWorkflowArgoUiBaseUrl(): string | undefined {
  const v = process.env.CLAWQL_WORKFLOW_ARGO_UI_BASE_URL?.trim();
  return v?.replace(/\/+$/, "") || undefined;
}

export function workflowDeleteAllowed(): boolean {
  return envTruthy(process.env.CLAWQL_WORKFLOW_ALLOW_DELETE);
}

export function getWorkflowLogTailMax(): number {
  const raw = process.env.CLAWQL_WORKFLOW_LOG_TAIL_MAX?.trim();
  if (!raw) return 200;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 200;
  return Math.min(Math.max(parsed, 1), 500);
}

export function getWorkflowGenerateNamePrefix(): string {
  const v = process.env.CLAWQL_WORKFLOW_GENERATE_NAME_PREFIX?.trim();
  return v || "clawql-";
}

export function resolveWorkflowNamespace(namespace?: string): string | undefined {
  const ns = namespace?.trim() || getWorkflowDefaultNamespace();
  return ns || undefined;
}

export function isNamespaceAllowed(namespace: string): boolean {
  const allowlist = getWorkflowNamespaceAllowlist();
  if (allowlist.length === 0) return false;
  return allowlist.includes(namespace);
}

/** `ns/name` or `cluster/name` glob-ish match against allowlist entries. */
export function isTemplateAllowed(
  kind: "WorkflowTemplate" | "ClusterWorkflowTemplate",
  name: string,
  namespace?: string
): boolean {
  const allowlist = getWorkflowTemplateAllowlist();
  if (allowlist.length === 0) return true;
  const key =
    kind === "ClusterWorkflowTemplate" ? `cluster/${name}` : `${namespace ?? ""}/${name}`;
  return allowlist.some((entry) => {
    if (entry === key) return true;
    if (entry.endsWith("/*") && key.startsWith(entry.slice(0, -1))) return true;
    return false;
  });
}

export const WORKFLOW_MANAGED_LABEL = "clawql.dev/managed";
export const WORKFLOW_CORRELATION_LABEL = "clawql.dev/correlation-id";
