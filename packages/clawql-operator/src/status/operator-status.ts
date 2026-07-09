import { CoreV1Api, CustomObjectsApi, KubeConfig } from "@kubernetes/client-node";
import { CLAWQL_INSTANCE_CRD } from "../reconcile/reconcile-instance.js";

export type OperatorStatusRow = {
  namespace: string;
  name: string;
  phase?: string;
  configMapName?: string;
  tier?: string;
};

export type OperatorStatusReport = {
  crdInstalled: boolean;
  instances: OperatorStatusRow[];
  error?: string;
};

function loadKubeConfig(): KubeConfig | null {
  try {
    const kc = new KubeConfig();
    try {
      kc.loadFromCluster();
    } catch {
      kc.loadFromDefault();
    }
    return kc;
  } catch {
    return null;
  }
}

export async function collectOperatorStatus(): Promise<OperatorStatusReport> {
  const kc = loadKubeConfig();
  if (!kc) {
    return { crdInstalled: false, instances: [], error: "kubeconfig not available" };
  }

  const customObjects = kc.makeApiClient(CustomObjectsApi);
  let crdInstalled = true;
  try {
    const list = await customObjects.listClusterCustomObject({
      group: CLAWQL_INSTANCE_CRD.group,
      version: CLAWQL_INSTANCE_CRD.version,
      plural: CLAWQL_INSTANCE_CRD.plural,
    });
    const items = ((list as { items?: unknown[] }).items ?? []) as Array<{
      metadata: { name: string; namespace: string };
      spec?: { tier?: string };
      status?: { phase?: string; configMapName?: string };
    }>;
    return {
      crdInstalled: true,
      instances: items.map((item) => ({
        namespace: item.metadata.namespace,
        name: item.metadata.name,
        phase: item.status?.phase,
        configMapName: item.status?.configMapName,
        tier: item.spec?.tier,
      })),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|404|no matches for kind/i.test(msg)) {
      crdInstalled = false;
    }
    return { crdInstalled, instances: [], error: msg };
  }
}

export function formatOperatorStatus(report: OperatorStatusReport): string {
  const lines = ["ClawQL operator status", ""];
  if (report.error && !report.crdInstalled) {
    lines.push(`  ✗ CRD not installed or unreachable: ${report.error}`);
    lines.push("");
    lines.push("Install:");
    lines.push(
      "  helm upgrade --install clawql-operator ./charts/clawql-operator -n clawql-system --create-namespace"
    );
    lines.push("  kubectl apply -f examples/operator/clawqlinstance-minimal.yaml -n clawql");
    lines.push("");
    return lines.join("\n");
  }
  lines.push("  ✓ ClawQLInstance CRD reachable");
  if (report.instances.length === 0) {
    lines.push("  · No ClawQLInstance resources yet");
  } else {
    for (const row of report.instances) {
      lines.push(
        `  ✓ ${row.namespace}/${row.name} tier=${row.tier ?? "?"} phase=${row.phase ?? "Pending"} configMap=${row.configMapName ?? "-"}`
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Best-effort: verify tier-spec ConfigMap exists for each Ready instance. */
export async function verifyTierSpecConfigMaps(report: OperatorStatusReport): Promise<string[]> {
  const kc = loadKubeConfig();
  if (!kc) return [];
  const core = kc.makeApiClient(CoreV1Api);
  const notes: string[] = [];
  for (const row of report.instances) {
    if (!row.configMapName) continue;
    try {
      await core.readNamespacedConfigMap({ name: row.configMapName, namespace: row.namespace });
      notes.push(`  ✓ ConfigMap ${row.namespace}/${row.configMapName}`);
    } catch {
      notes.push(`  ✗ Missing ConfigMap ${row.namespace}/${row.configMapName}`);
    }
  }
  return notes;
}
