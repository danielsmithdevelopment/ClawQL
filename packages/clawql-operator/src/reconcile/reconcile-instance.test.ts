import { describe, expect, it, vi } from "vitest";
import { reconcileClawqlInstance, type ClawQLInstanceObject } from "./reconcile-instance.js";
import { CLAWQL_INSTANCE_TIER_SPEC_CONFIGMAP_KEY } from "./tier-spec-configmap.js";

describe("reconcileClawqlInstance", () => {
  it("creates tier spec ConfigMap and returns Ready status", async () => {
    const create = vi.fn().mockResolvedValue({});
    const read = vi.fn().mockRejectedValue({ statusCode: 404 });
    const instance: ClawQLInstanceObject = {
      apiVersion: "clawql.io/v1alpha1",
      kind: "ClawQLInstance",
      metadata: { name: "clawql", namespace: "clawql", generation: 2 },
      spec: {
        tier: "standard",
        memory: { enabled: true },
        documents: { enabled: false },
      },
    };

    const result = await reconcileClawqlInstance(instance, {
      readNamespacedConfigMap: read,
      createNamespacedConfigMap: create,
      replaceNamespacedConfigMap: vi.fn(),
    });

    expect(result.status.phase).toBe("Ready");
    expect(result.status.configMapName).toBe("clawql-tier-spec");
    expect(create).toHaveBeenCalledOnce();
    const body = create.mock.calls[0]?.[1] as { data: Record<string, string> };
    expect(body.data[CLAWQL_INSTANCE_TIER_SPEC_CONFIGMAP_KEY]).toContain('"memory"');
  });

  it("returns Degraded on invalid spec", async () => {
    const instance: ClawQLInstanceObject = {
      apiVersion: "clawql.io/v1alpha1",
      kind: "ClawQLInstance",
      metadata: { name: "bad", namespace: "clawql", generation: 1 },
      spec: { tier: "invalid-tier" },
    };
    const result = await reconcileClawqlInstance(instance, {
      readNamespacedConfigMap: vi.fn(),
      createNamespacedConfigMap: vi.fn(),
      replaceNamespacedConfigMap: vi.fn(),
    });
    expect(result.status.phase).toBe("Degraded");
  });
});
