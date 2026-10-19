import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { identifyModel } from "./identity.js";
import { loadModelProvenancePolicy } from "./policy.js";
import { assertModelProvenanceEffect, evaluateModelProvenanceEffect } from "./gate.js";
import { withModelProvenance } from "./provenance-gateway.js";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { buildModelProvenanceComplianceReport } from "./compliance-report.js";
import type { InferenceRecord, InferenceStore } from "../store/types.js";

function mockGateway(calls: string[]): InferenceGateway {
  return {
    async complete(request: InferenceRequest): Promise<InferenceResponse> {
      const model = request.model ?? "unknown";
      calls.push(model);
      return { content: `ok:${model}`, model };
    },
  };
}

describe("model identity table", () => {
  it("resolves clawql/cheap-chat to origin-neutral Meta Llama via Groq", () => {
    const id = identifyModel("clawql/cheap-chat");
    expect(id.resolvedId).toBe("groq/llama-3.1-8b-instant");
    // Weight vendor is Meta; Groq is the inference host/aggregator.
    expect(id.vendor).toBe("meta");
    expect(id.known).toBe(true);
  });

  it("maps openrouter/deepseek/* and aliases to vendor deepseek", () => {
    expect(identifyModel("openrouter/deepseek/deepseek-chat").vendor).toBe("deepseek");
    expect(identifyModel("clawql/deepseek-chat").vendor).toBe("deepseek");
    expect(identifyModel("deepseek/deepseek-chat").canonicalId).toBe("deepseek/deepseek-chat");
  });

  it("maps aggregator paths to weight vendor not aggregator", () => {
    expect(identifyModel("openrouter/anthropic/claude-sonnet-4").vendor).toBe("anthropic");
    expect(identifyModel("openrouter/qwen/qwen3.6-plus").vendor).toBe("qwen");
  });
});

describe("provenance policy", () => {
  it("auto-denies deepseek when CLAWQL_INFERENCE_DISABLE_PROVIDERS includes deepseek", () => {
    const policy = loadModelProvenancePolicy({
      CLAWQL_INFERENCE_DISABLE_PROVIDERS: "deepseek",
    });
    expect(policy.enabled).toBe(true);
    expect(policy.mode).toBe("deny");
    expect(policy.deniedVendors.has("deepseek")).toBe(true);
  });

  it("federal profile uses allowlist and denies deepseek", () => {
    const policy = loadModelProvenancePolicy({
      CLAWQL_INFERENCE_PROVENANCE_PROFILE: "federal",
    });
    expect(policy.enabled).toBe(true);
    expect(policy.mode).toBe("allow");
    expect(policy.deniedVendors.has("deepseek")).toBe(true);
    expect(policy.allowedVendors.has("anthropic")).toBe(true);
    expect(policy.allowedVendors.has("deepseek")).toBe(false);
  });
});

describe("provenance gate on resolved identity", () => {
  it("denies openrouter/deepseek when deepseek is disabled via provider denylist", async () => {
    const policy = loadModelProvenancePolicy({
      CLAWQL_INFERENCE_DISABLE_PROVIDERS: "deepseek",
    });
    const decision = await Effect.runPromise(
      evaluateModelProvenanceEffect("openrouter/deepseek/deepseek-chat", policy)
    );
    expect(decision.allow).toBe(false);
  });

  it("denies clawql/deepseek-chat opt-in alias after catalog resolve", async () => {
    const policy = loadModelProvenancePolicy({
      CLAWQL_INFERENCE_DENIED_VENDORS: "deepseek",
    });
    await expect(
      Effect.runPromise(assertModelProvenanceEffect("clawql/deepseek-chat", policy))
    ).rejects.toThrow(/provenance|denied/i);
  });

  it("allows anthropic under federal allowlist", async () => {
    const policy = loadModelProvenancePolicy({
      CLAWQL_INFERENCE_PROVENANCE_PROFILE: "federal",
    });
    const identity = await Effect.runPromise(
      assertModelProvenanceEffect("anthropic/claude-sonnet-4", policy)
    );
    expect(identity.vendor).toBe("anthropic");
  });

  it("fails closed on unknown model under federal allowlist", async () => {
    const policy = loadModelProvenancePolicy({
      CLAWQL_INFERENCE_PROVENANCE_PROFILE: "federal",
    });
    // Bare id with no vendor hint
    await expect(
      Effect.runPromise(assertModelProvenanceEffect("mystery-local-weights-v1", policy))
    ).rejects.toThrow(/fail closed|denied/i);
  });

  it("denies deepseek under federal even when listed in allowed vendors", async () => {
    const policy = loadModelProvenancePolicy({
      CLAWQL_INFERENCE_PROVENANCE_PROFILE: "federal",
      CLAWQL_INFERENCE_ALLOWED_VENDORS: "anthropic,deepseek",
    });
    // deniedVendors checked first
    const decision = await Effect.runPromise(
      evaluateModelProvenanceEffect("deepseek/deepseek-chat", policy)
    );
    expect(decision.allow).toBe(false);
  });
});

describe("provenance gateway decorator", () => {
  it("blocks complete before provider call when vendor denied", async () => {
    const calls: string[] = [];
    const gateway = withModelProvenance(mockGateway(calls), {
      env: { CLAWQL_INFERENCE_DISABLE_PROVIDERS: "deepseek" },
    });
    await expect(
      gateway.complete({
        model: "openrouter/deepseek/deepseek-chat",
        messages: [{ role: "user", content: "hi" }],
        correlationId: "corr-deny-1",
      })
    ).rejects.toThrow(/provenance|denied/i);
    expect(calls).toEqual([]);
  });

  it("allows non-denied models through", async () => {
    const calls: string[] = [];
    const gateway = withModelProvenance(mockGateway(calls), {
      env: { CLAWQL_INFERENCE_DISABLE_PROVIDERS: "deepseek" },
    });
    const res = await gateway.complete({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.content).toBe("ok:anthropic/claude-sonnet-4");
    expect(calls).toEqual(["anthropic/claude-sonnet-4"]);
  });

  it("checks each fallback attempt model id", async () => {
    const calls: string[] = [];
    const failingThenOk: InferenceGateway = {
      async complete(request) {
        const model = request.model ?? "";
        if (model.includes("deepseek")) {
          throw new Error("should not reach provider for deepseek");
        }
        calls.push(model);
        return { content: "ok", model };
      },
    };
    const policy = loadModelProvenancePolicy({
      CLAWQL_INFERENCE_DENIED_VENDORS: "deepseek",
    });
    const guarded = withModelProvenance(failingThenOk, { policy });
    // Simulate fallback chain calling guarded.complete per attempt
    await expect(
      guarded.complete({
        model: "deepseek/deepseek-chat",
        messages: [{ role: "user", content: "hi" }],
      })
    ).rejects.toThrow(/provenance|denied/i);
    const ok = await guarded.complete({
      model: "groq/llama-3.1-8b-instant",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(ok.content).toBe("ok");
    expect(calls).toEqual(["groq/llama-3.1-8b-instant"]);
  });
});

describe("compliance report", () => {
  it("attests served models and states identity-vs-weight-origin limit", async () => {
    const records: InferenceRecord[] = [
      {
        id: "1",
        timestamp: new Date().toISOString(),
        modelId: "anthropic/claude-sonnet-4",
        provider: "anthropic",
        messages: [{ role: "user", content: "hi" }],
        response: "hello",
        latencyMs: 10,
        evaluatorVerdict: "none",
      },
      {
        id: "2",
        timestamp: new Date().toISOString(),
        modelId: "deepseek/deepseek-chat",
        provider: "deepseek",
        messages: [{ role: "user", content: "hi" }],
        response: "provenance_denied:Model provenance policy denied vendor",
        latencyMs: 0,
        evaluatorVerdict: "failed",
      },
    ];
    const store: InferenceStore = {
      async append() {},
      async list() {
        return records;
      },
      async getByCorrelationId() {
        return [];
      },
      async spendRollup() {
        return [];
      },
    };
    const report = await buildModelProvenanceComplianceReport({
      store,
      env: { CLAWQL_INFERENCE_DENIED_VENDORS: "deepseek" },
      customerHeldRoot: "sha256:deadbeef",
    });
    expect(report.ok).toBe(true);
    expect(report.served).toHaveLength(1);
    expect(report.served[0]?.vendor).toBe("anthropic");
    expect(report.deniedAttemptHints.length).toBeGreaterThan(0);
    expect(report.attestation).toContain("No prohibited model vendor");
    expect(report.attestation).toContain("sha256:deadbeef");
    expect(report.limit).toContain("does not attest to the geographic or organizational origin");
  });
});
