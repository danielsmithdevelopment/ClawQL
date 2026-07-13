import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadFallbackConfig } from "./fallback/config.js";
import { createInferenceGateway } from "./gateway.js";
import { loadModelEscalationConfig } from "./routing/config.js";
import { resolveInferenceEffectiveEnv } from "./policy/manifest.js";

describe("runtime policy.yaml", () => {
  it("resolveInferenceEffectiveEnv applies manifest defaults", () => {
    const dir = join(tmpdir(), `clawql-runtime-policy-${Date.now()}`);
    mkdirSync(join(dir, "Inference"), { recursive: true });
    writeFileSync(
      join(dir, "Inference", "policy.yaml"),
      `inference:
  escalation:
    enabled: true
  fallback:
    enabled: true
`,
      "utf8"
    );

    const effective = resolveInferenceEffectiveEnv({ CLAWQL_HOME: dir });
    expect(loadModelEscalationConfig(effective).enabled).toBe(true);
    expect(loadFallbackConfig(effective).enabled).toBe(true);
  });

  it("env overrides manifest for gateway-related loaders", () => {
    const dir = join(tmpdir(), `clawql-runtime-policy-override-${Date.now()}`);
    mkdirSync(join(dir, "Inference"), { recursive: true });
    writeFileSync(
      join(dir, "Inference", "policy.yaml"),
      `inference:
  escalation:
    enabled: true
`,
      "utf8"
    );

    const effective = resolveInferenceEffectiveEnv({
      CLAWQL_HOME: dir,
      CLAWQL_INFERENCE_ROUTING_ENABLED: "0",
    });
    expect(loadModelEscalationConfig(effective).enabled).toBe(false);
  });

  it("createInferenceGateway merges policy manifest into stack env", () => {
    const dir = join(tmpdir(), `clawql-gateway-policy-${Date.now()}`);
    mkdirSync(join(dir, "Inference"), { recursive: true });
    writeFileSync(
      join(dir, "Inference", "policy.yaml"),
      `inference:
  keys:
    enabled: true
`,
      "utf8"
    );

    const gateway = createInferenceGateway({ env: { CLAWQL_HOME: dir } });
    expect(gateway).toBeDefined();
    const effective = resolveInferenceEffectiveEnv({ CLAWQL_HOME: dir });
    expect(effective.CLAWQL_INFERENCE_KEYS_ENABLED).toBe("1");
  });
});
