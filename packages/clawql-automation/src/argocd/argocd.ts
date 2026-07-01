/**
 * Optional `argocd` MCP tool — Argo CD Application observe/sync (K8s CRD API).
 */

import { z } from "zod";
import { KubeConfig, CustomObjectsApi } from "@kubernetes/client-node";
import {
  ARGO_CD_CRD,
  argocdSyncAllowed,
  argocdToolEnabled,
  isArgocdNamespaceAllowed,
  resolveArgocdNamespace,
  getArgocdKubeconfigPath,
} from "./env.js";

export const argocdToolSchema = {
  operation: z.enum(["list", "get", "sync"]).describe("list | get | sync Argo CD Applications."),
  namespace: z.string().max(63).optional(),
  name: z.string().max(253).optional(),
  label_selector: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  prune: z.boolean().optional().describe("For sync: prune resources not in Git (default false)."),
  dry_run: z.boolean().optional().describe("For sync: dry-run only (default false)."),
};

const argocdInputSchema = z.object(argocdToolSchema).superRefine((data, ctx) => {
  if (data.operation === "get" || data.operation === "sync") {
    if (!data.name?.trim()) {
      ctx.addIssue({ code: "custom", message: `${data.operation} requires name` });
    }
  }
});

export type ArgoCdApplicationObject = {
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    labels?: Record<string, string>;
    generation?: number;
  };
  spec?: {
    project?: string;
    source?: {
      repoURL?: string;
      path?: string;
      targetRevision?: string;
      chart?: string;
    };
    destination?: {
      server?: string;
      namespace?: string;
      name?: string;
    };
    syncPolicy?: {
      automated?: { prune?: boolean; selfHeal?: boolean };
    };
  };
  status?: {
    sync?: {
      status?: string;
      revision?: string;
    };
    health?: {
      status?: string;
      message?: string;
    };
    operationState?: {
      phase?: string;
      message?: string;
      startedAt?: string;
      finishedAt?: string;
    };
  };
  operation?: {
    sync?: {
      prune?: boolean;
      dryRun?: boolean;
      revision?: string;
    };
    initiatedBy?: { username?: string };
  };
};

export type ArgoCdApplicationSummary = {
  namespace: string;
  name: string;
  uid?: string;
  project?: string;
  sync_status?: string;
  health_status?: string;
  revision?: string;
  destination_namespace?: string;
  source?: {
    repo_url?: string;
    path?: string;
    chart?: string;
    target_revision?: string;
  };
  operation_phase?: string;
};

let clientsPromise: Promise<CustomObjectsApi> | null = null;
let createClientsOverride: (() => Promise<CustomObjectsApi>) | null = null;

export function configureArgocdK8sFactory(factory: (() => Promise<CustomObjectsApi>) | null): void {
  createClientsOverride = factory;
  clientsPromise = null;
}

export function resetArgocdK8sClientsForTests(): void {
  clientsPromise = null;
  createClientsOverride = null;
}

async function getArgocdK8sClient(): Promise<CustomObjectsApi> {
  if (createClientsOverride) return createClientsOverride();
  if (!clientsPromise) {
    clientsPromise = (async () => {
      const kc = new KubeConfig();
      const kubeconfigPath = getArgocdKubeconfigPath();
      if (kubeconfigPath) {
        kc.loadFromFile(kubeconfigPath);
      } else {
        try {
          kc.loadFromCluster();
        } catch {
          kc.loadFromDefault();
        }
      }
      return kc.makeApiClient(CustomObjectsApi);
    })();
  }
  return clientsPromise;
}

function jsonResponse(obj: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

function requireNamespace(
  namespace?: string
): { ok: true; namespace: string } | { ok: false; error: string } {
  const ns = resolveArgocdNamespace(namespace);
  if (!ns) {
    return {
      ok: false,
      error: "namespace is required (set namespace or CLAWQL_ARGO_CD_DEFAULT_NAMESPACE)",
    };
  }
  if (!isArgocdNamespaceAllowed(ns)) {
    return {
      ok: false,
      error: `namespace is not in CLAWQL_ARGO_CD_NAMESPACE_ALLOWLIST: ${ns}`,
    };
  }
  return { ok: true, namespace: ns };
}

export function mapApplicationToSummary(
  app: ArgoCdApplicationObject,
  namespace: string
): ArgoCdApplicationSummary {
  return {
    namespace,
    name: app.metadata?.name ?? "",
    uid: app.metadata?.uid,
    project: app.spec?.project,
    sync_status: app.status?.sync?.status,
    health_status: app.status?.health?.status,
    revision: app.status?.sync?.revision,
    destination_namespace: app.spec?.destination?.namespace,
    source: app.spec?.source
      ? {
          repo_url: app.spec.source.repoURL,
          path: app.spec.source.path,
          chart: app.spec.source.chart,
          target_revision: app.spec.source.targetRevision,
        }
      : undefined,
    operation_phase: app.status?.operationState?.phase,
  };
}

async function getApplication(namespace: string, name: string): Promise<ArgoCdApplicationObject> {
  const customObjects = await getArgocdK8sClient();
  const res = await customObjects.getNamespacedCustomObject({
    group: ARGO_CD_CRD.group,
    version: ARGO_CD_CRD.version,
    namespace,
    plural: ARGO_CD_CRD.applicationPlural,
    name,
  });
  return res as ArgoCdApplicationObject;
}

export async function handleArgocdToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  if (!argocdToolEnabled()) {
    return jsonResponse({
      ok: false,
      error:
        "argocd tool is not enabled. Set CLAWQL_ENABLE_ARGO_CD=1 and configure CLAWQL_ARGO_CD_NAMESPACE_ALLOWLIST.",
    });
  }

  const parsed = argocdInputSchema.parse(params);

  try {
    const customObjects = await getArgocdK8sClient();
    switch (parsed.operation) {
      case "list": {
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const limit = parsed.limit ?? 50;
        const res = (await customObjects.listNamespacedCustomObject({
          group: ARGO_CD_CRD.group,
          version: ARGO_CD_CRD.version,
          namespace: nsCheck.namespace,
          plural: ARGO_CD_CRD.applicationPlural,
          labelSelector: parsed.label_selector,
          limit,
        })) as { items?: ArgoCdApplicationObject[] };
        const applications = (res.items ?? []).map((a) =>
          mapApplicationToSummary(a, nsCheck.namespace)
        );
        return jsonResponse({
          ok: true,
          operation: "list",
          namespace: nsCheck.namespace,
          applications,
        });
      }
      case "get": {
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const app = await getApplication(nsCheck.namespace, parsed.name!);
        return jsonResponse({
          ok: true,
          operation: "get",
          application: mapApplicationToSummary(app, nsCheck.namespace),
        });
      }
      case "sync": {
        if (!argocdSyncAllowed()) {
          return jsonResponse({
            ok: false,
            error: "sync is disabled. Set CLAWQL_ARGO_CD_ALLOW_SYNC=1.",
          });
        }
        const nsCheck = requireNamespace(parsed.namespace);
        if (!nsCheck.ok) return jsonResponse({ ok: false, error: nsCheck.error });
        const existing = await getApplication(nsCheck.namespace, parsed.name!);
        const body: ArgoCdApplicationObject = {
          ...existing,
          operation: {
            sync: {
              prune: parsed.prune === true,
              dryRun: parsed.dry_run === true,
              revision: existing.status?.sync?.revision,
            },
            initiatedBy: { username: "clawql-mcp" },
          },
        };
        const updated = (await customObjects.replaceNamespacedCustomObject({
          group: ARGO_CD_CRD.group,
          version: ARGO_CD_CRD.version,
          namespace: nsCheck.namespace,
          plural: ARGO_CD_CRD.applicationPlural,
          name: parsed.name!,
          body,
        })) as ArgoCdApplicationObject;
        return jsonResponse({
          ok: true,
          operation: "sync",
          application: mapApplicationToSummary(updated, nsCheck.namespace),
          sync_requested: true,
        });
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, operation: parsed.operation, error: message });
  }
}
