import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadFallbackConfig, saveFallbackChainsFile } from "./config.js";

describe("fallback config", () => {
  it("merges env tier chains with file overrides", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-fallback-"));
    const env = {
      CLAWQL_HOME: dir,
      CLAWQL_INFERENCE_FALLBACK_ENABLED: "1",
      CLAWQL_INFERENCE_FALLBACK_FRUGAL: "ollama/phi4,openai/gpt-4o-mini",
    };
    try {
      await saveFallbackChainsFile(
        {
          byTier: {},
          byModel: { "openai/gpt-4o": ["openai/gpt-4o", "anthropic/claude-sonnet-4"] },
        },
        env
      );
      const config = loadFallbackConfig(env);
      expect(config.enabled).toBe(true);
      expect(config.chains.byTier.frugal).toEqual(["ollama/phi4", "openai/gpt-4o-mini"]);
      expect(config.chains.byModel["openai/gpt-4o"]).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
