import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  loadInferencePolicyManifestSync,
  manifestToEnvOverrides,
  mergeEnvWithPolicyManifest,
  resolveInferenceEffectiveEnv,
  parseInferencePolicyManifestText,
} from "./manifest.js";

describe("inference policy manifest", () => {
  it("parses YAML inference block", () => {
    const manifest = parseInferencePolicyManifestText(`
policyVersion: "2026.07.01"
inference:
  escalation:
    enabled: true
    tierMap:
      frugal: ollama/custom-frugal
  cache:
    enabled: true
    threshold: 0.95
  pipelineWorker:
    enabled: true
    pollMs: 30000
`);
    expect(manifest?.policyVersion).toBe("2026.07.01");
    expect(manifest?.inference.escalation?.enabled).toBe(true);
    expect(manifest?.inference.escalation?.tierMap?.frugal).toBe("ollama/custom-frugal");
    expect(manifest?.inference.cache?.threshold).toBe(0.95);
    expect(manifest?.inference.pipelineWorker?.pollMs).toBe(30000);
  });

  it("maps manifest to env overrides", () => {
    const manifest = parseInferencePolicyManifestText(`
inference:
  escalation:
    enabled: true
  keys:
    enabled: true
`);
    expect(manifest).not.toBeNull();
    const env = manifestToEnvOverrides(manifest!);
    expect(env.CLAWQL_INFERENCE_ROUTING_ENABLED).toBe("1");
    expect(env.CLAWQL_INFERENCE_KEYS_ENABLED).toBe("1");
  });

  it("lets explicit env override manifest defaults", () => {
    const manifest = parseInferencePolicyManifestText(`
inference:
  escalation:
    enabled: true
`);
    const merged = mergeEnvWithPolicyManifest({ CLAWQL_INFERENCE_ROUTING_ENABLED: "0" }, manifest);
    expect(merged.CLAWQL_INFERENCE_ROUTING_ENABLED).toBe("0");
  });

  it("loads manifest from CLAWQL_HOME/Inference/policy.yaml", () => {
    const dir = join(tmpdir(), `clawql-policy-${Date.now()}`);
    mkdirSync(join(dir, "Inference"), { recursive: true });
    writeFileSync(
      join(dir, "Inference", "policy.yaml"),
      `inference:\n  fallback:\n    enabled: true\n`,
      "utf8"
    );
    const loaded = loadInferencePolicyManifestSync({ CLAWQL_HOME: dir });
    expect(loaded?.path).toContain("policy.yaml");
    expect(loaded?.manifest.inference.fallback?.enabled).toBe(true);
  });

  it("resolveInferenceEffectiveEnv is mergeEnvWithPolicyManifest from disk", () => {
    const dir = join(tmpdir(), `clawql-effective-env-${Date.now()}`);
    mkdirSync(join(dir, "Inference"), { recursive: true });
    writeFileSync(
      join(dir, "Inference", "policy.yaml"),
      `inference:\n  pipelineWorker:\n    enabled: true\n`,
      "utf8"
    );
    const effective = resolveInferenceEffectiveEnv({ CLAWQL_HOME: dir });
    expect(effective.CLAWQL_INFERENCE_PIPELINE_WORKER).toBe("1");
  });
});
