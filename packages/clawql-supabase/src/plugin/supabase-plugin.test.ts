import { describe, expect, it } from "vitest";
import { createSupabasePlugin, SUPABASE_PLUGIN_ID } from "./supabase-plugin.js";

describe("createSupabasePlugin", () => {
  it("returns stable plugin id", () => {
    const plugin = createSupabasePlugin({ CLAWQL_ENABLE_SUPABASE: "1" } as NodeJS.ProcessEnv);
    expect(plugin.id).toBe(SUPABASE_PLUGIN_ID);
    expect(plugin.version).toBe("0.1.0");
    expect(plugin.skills?.some((s) => s.skillId === "supabase-managed-signup")).toBe(true);
    expect(plugin.tools ?? []).toEqual([]);
  });

  it("does not register agent-facing MCP tools when enabled", () => {
    const plugin = createSupabasePlugin({ CLAWQL_ENABLE_SUPABASE: "1" } as NodeJS.ProcessEnv);
    expect(plugin.tools).toBeUndefined();
    expect(JSON.stringify(plugin)).not.toMatch(/supabase_verify_session|supabase_checkout_handoff/);
  });
});
