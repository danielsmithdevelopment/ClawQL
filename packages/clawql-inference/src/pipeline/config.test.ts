import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPipelineConfig, loadPipelineConfig, savePipelineConfig } from "./config.js";

describe("pipeline config", () => {
  it("saves and loads pipeline config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-pipeline-"));
    const env = { CLAWQL_HOME: dir };
    try {
      const config = buildPipelineConfig({ enabled: true, minSamples: 100 });
      const path = await savePipelineConfig(config, env);
      expect(path).toContain("pipeline.json");
      const loaded = await loadPipelineConfig(env);
      expect(loaded?.enabled).toBe(true);
      expect(loaded?.minSamples).toBe(100);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
