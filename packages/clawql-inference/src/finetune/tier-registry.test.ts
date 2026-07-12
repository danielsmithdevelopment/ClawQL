import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mergeTierMap, registerModelToTier, loadTierMapOverrides } from "./tier-registry.js";

describe("tier-registry", () => {
  it("registers and reloads tier overrides", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-tier-"));
    const env = { CLAWQL_HOME: dir };
    try {
      const { path, tierMap } = await registerModelToTier("frugal", "ollama/phi4-custom", env);
      expect(path).toContain("tier-map.json");
      expect(tierMap.frugal).toBe("ollama/phi4-custom");
      const loaded = await loadTierMapOverrides(env);
      expect(loaded.frugal).toBe("ollama/phi4-custom");
      const raw = await readFile(path, "utf8");
      expect(raw).toContain("phi4-custom");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("merges overrides onto base tier map", () => {
    const merged = mergeTierMap(
      { frugal: "a", standard: "b", frontier: "c" },
      { frugal: "custom" }
    );
    expect(merged.frugal).toBe("custom");
    expect(merged.standard).toBe("b");
  });
});
