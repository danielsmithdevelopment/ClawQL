import { describe, expect, it, vi } from "vitest";
import { resolveMcpRolloutTarget, rolloutMcpDeployment } from "./mcp-rollout.js";

describe("resolveMcpRolloutTarget", () => {
  it("returns undefined when rollout disabled", () => {
    expect(resolveMcpRolloutTarget("clawql", "inst", { tier: "standard" })).toBeUndefined();
  });

  it("defaults deployment name to clawql-mcp-http", () => {
    expect(
      resolveMcpRolloutTarget("clawql", "inst", {
        mcp: { rolloutOnTierSpecChange: true },
      })
    ).toEqual({ deploymentName: "clawql-mcp-http", namespace: "clawql" });
  });
});

describe("rolloutMcpDeployment", () => {
  it("patches deployment with restart annotation", async () => {
    const patch = vi.fn().mockResolvedValue({});
    await rolloutMcpDeployment(
      { deploymentName: "clawql-mcp-http", namespace: "clawql" },
      { patchNamespacedDeployment: patch }
    );
    expect(patch).toHaveBeenCalledOnce();
    const body = patch.mock.calls[0]?.[0] as {
      body: { spec: { template: { metadata: { annotations: Record<string, string> } } } };
    };
    expect(
      body.body.spec.template.metadata.annotations["clawql.io/instance-spec-restartedAt"]
    ).toBeTruthy();
  });
});
