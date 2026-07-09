import { describe, expect, it } from "vitest";
import { resolvePluginCompositionFlags } from "./resolve-plugin-flags.js";

describe("resolvePluginCompositionFlags", () => {
  it("returns env-only flags when no instance spec is configured", () => {
    const env = { CLAWQL_ENABLE_MEMORY: "1", CLAWQL_ENABLE_DOCUMENTS: "0" };
    const flags = resolvePluginCompositionFlags(env);
    expect(flags.enableMemory).toBe(true);
    expect(flags.enableDocuments).toBe(false);
  });

  it("overlays tier toggles from CLAWQL_INSTANCE_SPEC JSON", () => {
    const env = {
      CLAWQL_ENABLE_MEMORY: "1",
      CLAWQL_ENABLE_DOCUMENTS: "1",
      CLAWQL_INSTANCE_SPEC: JSON.stringify({
        memory: { enabled: false },
        documents: { enabled: true, onyx: { enabled: true } },
      }),
    };
    const flags = resolvePluginCompositionFlags(env);
    expect(flags.enableMemory).toBe(false);
    expect(flags.enableDocuments).toBe(true);
    expect(flags.enableOnyxKnowledge).toBe(true);
  });
});
