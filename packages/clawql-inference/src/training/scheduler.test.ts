import { describe, expect, it } from "vitest";
import { buildTrainingWorkflow } from "./scheduler.js";
import { defaultHyperparams } from "./pipeline.js";
import type { TrainingConfig } from "./types.js";

function baseConfig(overrides?: Partial<TrainingConfig>): TrainingConfig {
  return {
    runId: "abc123",
    description: "test",
    baseModel: "qwen3.6-27b",
    adapterMethod: "qlora",
    method: { type: "sft" },
    dataSource: {
      bucket: "r2://clawql-training-data",
      filter: { minCriterionPassRate: 0.9 },
      splitRatio: 0.9,
    },
    gpuConfig: { gpuType: "rtx5090", gpuCount: 1 },
    hyperparams: defaultHyperparams(),
    outputPath: "/data/adapter",
    evalAfterTraining: true,
    evalBenchmark: "harvey-lab-firm-knowledge",
    evalPassThreshold: 0.65,
    autoPromote: true,
    domain: "legal",
    adapterVersion: "v1",
    ...overrides,
  };
}

describe("buildTrainingWorkflow", () => {
  it("builds collect → format → train → evaluate → promote DAG", () => {
    const wf = buildTrainingWorkflow(baseConfig());
    expect(wf.metadata.name).toBe("clawql-training-abc123");
    const names = wf.spec.dag.tasks.map((t) => t.name);
    expect(names).toEqual(["collect", "format", "train", "evaluate", "promote"]);
    expect(wf.spec.dag.tasks.find((t) => t.name === "promote")?.dependencies).toEqual(["evaluate"]);
  });

  it("omits evaluate/promote when eval disabled", () => {
    const wf = buildTrainingWorkflow(baseConfig({ evalAfterTraining: false, autoPromote: false }));
    expect(wf.spec.dag.tasks.map((t) => t.name)).toEqual(["collect", "format", "train"]);
  });
});
