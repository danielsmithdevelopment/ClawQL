import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveInferencePolicy } from "./resolve.js";

describe("resolveInferencePolicy", () => {
  it("aggregates env-backed policy view", () => {
    const policy = resolveInferencePolicy({
      CLAWQL_INFERENCE_ROUTING_ENABLED: "1",
      CLAWQL_INFERENCE_SEMANTIC_CACHE: "1",
      CLAWQL_INFERENCE_STORE: "postgres",
      CLAWQL_INFERENCE_DATABASE_URL: "postgres://localhost/test",
      CLAWQL_INFERENCE_PIPELINE_WORKER: "1",
      CLAWQL_INFERENCE_AGENT_COORDINATION_ENABLED: "1",
    });
    expect(policy.source).toBe("env");
    expect(policy.escalation.enabled).toBe(true);
    expect(policy.cache.enabled).toBe(true);
    expect(policy.store.backend).toBe("postgres");
    expect(policy.store.postgresConfigured).toBe(true);
    expect(policy.pipelineWorker.enabled).toBe(true);
    expect(policy.agentCoordination.enabled).toBe(true);
  });

  it("merges manifest YAML with env overrides winning", () => {
    const dir = join(tmpdir(), `clawql-resolve-policy-${Date.now()}`);
    mkdirSync(join(dir, "Inference"), { recursive: true });
    writeFileSync(
      join(dir, "Inference", "policy.yaml"),
      `policyVersion: manifest-v1
inference:
  escalation:
    enabled: true
    tierMap:
      frugal: ollama/from-manifest
  pipelineWorker:
    enabled: true
    pollMs: 45000
`,
      "utf8"
    );

    const policy = resolveInferencePolicy({
      CLAWQL_HOME: dir,
      CLAWQL_INFERENCE_ROUTING_ENABLED: "0",
    });
    expect(policy.source).toBe("manifest+env");
    expect(policy.manifestPath).toContain("policy.yaml");
    expect(policy.policyVersion).toBe("manifest-v1");
    expect(policy.escalation.enabled).toBe(false);
    expect(policy.pipelineWorker.enabled).toBe(true);
    expect(policy.pipelineWorker.pollMs).toBe(45000);
  });
});
