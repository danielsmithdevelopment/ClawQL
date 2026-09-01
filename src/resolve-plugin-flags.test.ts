import { describe, expect, it } from "vitest";
import { resolvePluginCompositionFlags } from "./resolve-plugin-flags.js";

describe("resolvePluginCompositionFlags", () => {
  it("uses standard tier preset when no instance spec is configured (ignores CLAWQL_ENABLE_*)", () => {
    const flags = resolvePluginCompositionFlags({
      CLAWQL_ENABLE_MEMORY: "0",
      CLAWQL_ENABLE_DOCUMENTS: "0",
      CLAWQL_ENABLE_SANDBOX: "1",
    });
    // standard preset: memory+documents on; sandbox off — env ENABLE_* must not win
    expect(flags.enableMemory).toBe(true);
    expect(flags.enableDocuments).toBe(true);
    expect(flags.enableSandbox).toBe(false);
  });

  it("loads plugin toggles from CLAWQL_INSTANCE_SPEC JSON", () => {
    const flags = resolvePluginCompositionFlags({
      CLAWQL_INSTANCE_SPEC: JSON.stringify({
        tier: "local",
        memory: { enabled: false },
        documents: { enabled: true, onyx: { enabled: true } },
        sandbox: { enabled: true },
      }),
    });
    expect(flags.enableMemory).toBe(false);
    expect(flags.enableDocuments).toBe(true);
    expect(flags.enableOnyxKnowledge).toBe(true);
    expect(flags.enableSandbox).toBe(true);
  });

  it("honors CLAWQL_TIER=local when no instance spec", () => {
    const flags = resolvePluginCompositionFlags({ CLAWQL_TIER: "local" });
    expect(flags.enableMemory).toBe(true);
    expect(flags.enableDocuments).toBe(false);
  });
});
