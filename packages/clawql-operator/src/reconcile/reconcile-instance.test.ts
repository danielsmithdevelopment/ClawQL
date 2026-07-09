import { describe, expect, it, vi } from "vitest";
import { reconcileClawqlInstance, type ClawQLInstanceObject } from "./reconcile-instance.js";
import { CLAWQL_INSTANCE_AUTH_EXPECTATIONS_KEY } from "./auth-expectations.js";
import { CLAWQL_INSTANCE_TIER_SPEC_CONFIGMAP_KEY } from "./tier-spec-configmap.js";

const defaultStackSecret = {
  CLAWQL_GITHUB_TOKEN: "ghp",
  CLAWQL_SLACK_TOKEN: "xoxb",
  LINEAR_API_KEY: "lin",
  ONYX_API_TOKEN: "onyx",
  NOTION_API_TOKEN: "ntn",
  CLAWQL_CLOUDFLARE_API_TOKEN: "cf",
};

describe("reconcileClawqlInstance", () => {
  it("creates tier spec ConfigMap and returns Ready status when secrets present", async () => {
    const create = vi.fn().mockResolvedValue({});
    const read = vi.fn().mockRejectedValue({ statusCode: 404 });
    const readSecret = vi.fn().mockResolvedValue({ data: defaultStackSecret });
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
      readNamespacedSecret: readSecret,
      createNamespacedConfigMap: create,
      replaceNamespacedConfigMap: vi.fn(),
    });

    expect(result.status.phase).toBe("Ready");
    expect(result.status.configMapName).toBe("clawql-tier-spec");
    expect(create).toHaveBeenCalledOnce();
    const body = create.mock.calls[0]?.[1] as { data: Record<string, string> };
    expect(body.data[CLAWQL_INSTANCE_TIER_SPEC_CONFIGMAP_KEY]).toContain('"memory"');
    expect(body.data[CLAWQL_INSTANCE_AUTH_EXPECTATIONS_KEY]).toContain("githubToken");
    const secretsCondition = result.status.conditions?.find(
      (c) => c.type === "ProviderSecretsReady"
    );
    expect(secretsCondition?.status).toBe("True");
  });

  it("returns Degraded when required provider secrets are missing", async () => {
    const instance: ClawQLInstanceObject = {
      apiVersion: "clawql.io/v1alpha1",
      kind: "ClawQLInstance",
      metadata: { name: "clawql", namespace: "clawql", generation: 1 },
      spec: { tier: "local", documents: { enabled: false } },
    };
    const result = await reconcileClawqlInstance(instance, {
      readNamespacedConfigMap: vi.fn().mockRejectedValue({ statusCode: 404 }),
      readNamespacedSecret: vi.fn().mockRejectedValue({ statusCode: 404 }),
      createNamespacedConfigMap: vi.fn().mockResolvedValue({}),
      replaceNamespacedConfigMap: vi.fn(),
    });
    expect(result.status.phase).toBe("Degraded");
    const secretsCondition = result.status.conditions?.find(
      (c) => c.type === "ProviderSecretsReady"
    );
    expect(secretsCondition?.status).toBe("False");
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
      readNamespacedSecret: vi.fn(),
      createNamespacedConfigMap: vi.fn(),
      replaceNamespacedConfigMap: vi.fn(),
    });
    expect(result.status.phase).toBe("Degraded");
  });
});
