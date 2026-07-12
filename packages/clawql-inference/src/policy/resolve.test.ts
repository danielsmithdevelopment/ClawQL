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
    expect(policy.escalation.enabled).toBe(true);
    expect(policy.cache.enabled).toBe(true);
    expect(policy.store.backend).toBe("postgres");
    expect(policy.store.postgresConfigured).toBe(true);
    expect(policy.pipelineWorker.enabled).toBe(true);
    expect(policy.agentCoordination.enabled).toBe(true);
  });
});
