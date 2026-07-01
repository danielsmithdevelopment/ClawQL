/**
 * Environment configuration for the optional `argocd` MCP tool.
 */

const ARGO_GROUP = "argoproj.io";
const ARGO_VERSION = "v1alpha1";

export const ARGO_CD_CRD = {
  group: ARGO_GROUP,
  version: ARGO_VERSION,
  applicationPlural: "applications",
} as const;

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function argocdToolEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_ENABLE_ARGO_CD);
}

export function argocdSyncAllowed(): boolean {
  return envTruthy(process.env.CLAWQL_ARGO_CD_ALLOW_SYNC);
}

export function getArgocdNamespaceAllowlist(): string[] {
  const raw = process.env.CLAWQL_ARGO_CD_NAMESPACE_ALLOWLIST?.trim();
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function getArgocdDefaultNamespace(): string | undefined {
  const v = process.env.CLAWQL_ARGO_CD_DEFAULT_NAMESPACE?.trim();
  return v || undefined;
}

export function getArgocdKubeconfigPath(): string | undefined {
  const explicit = process.env.CLAWQL_ARGO_CD_KUBECONFIG?.trim();
  if (explicit) return explicit;
  return process.env.CLAWQL_WORKFLOW_KUBECONFIG?.trim() || undefined;
}

export function resolveArgocdNamespace(namespace?: string): string | undefined {
  const ns = namespace?.trim() || getArgocdDefaultNamespace();
  return ns || undefined;
}

export function isArgocdNamespaceAllowed(namespace: string): boolean {
  const allowlist = getArgocdNamespaceAllowlist();
  if (allowlist.length === 0) return false;
  return allowlist.includes(namespace);
}
