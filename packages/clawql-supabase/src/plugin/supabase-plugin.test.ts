import { describe, expect, it } from "vitest";
import { createSupabasePlugin, SUPABASE_PLUGIN_ID } from "./supabase-plugin.js";

describe("createSupabasePlugin", () => {
  it("returns stable plugin id with no MCP tools", () => {
    const plugin = createSupabasePlugin({
      CLAWQL_ENABLE_SUPABASE: "1",
      CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
    } as NodeJS.ProcessEnv);
    expect(plugin.id).toBe(SUPABASE_PLUGIN_ID);
    expect(plugin.version).toBe("0.1.0");
    expect(plugin.tools).toBeUndefined();
    const skill = plugin.skills?.find((s) => s.skillId === "supabase-managed-signup");
    expect(skill).toBeTruthy();
    expect(skill?.audience).toBe("operator");
    expect(plugin.tools ?? []).toEqual([]);
  });

  it("does not register agent-facing MCP tools when enabled", () => {
    const plugin = createSupabasePlugin({ CLAWQL_ENABLE_SUPABASE: "1" } as NodeJS.ProcessEnv);
    expect(plugin.tools).toBeUndefined();
    expect(JSON.stringify(plugin)).not.toMatch(/supabase_verify_session|supabase_checkout_handoff/);
  });

  it("does not register look-alike session or checkout MCP tools", () => {
    const plugin = createSupabasePlugin({
      CLAWQL_ENABLE_SUPABASE: "1",
      CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
    } as NodeJS.ProcessEnv);
    const names = plugin.tools?.map((t) => t.name) ?? [];
    expect(names).not.toContain("supabase_verify_session");
    expect(names).not.toContain("supabase_checkout_handoff");
  });

  it("vault seed holds no project URLs, keys, or secret names", () => {
    const plugin = createSupabasePlugin({
      CLAWQL_ENABLE_SUPABASE: "1",
      CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
    } as NodeJS.ProcessEnv);
    const blob = JSON.stringify(plugin.vaultSeed ?? []);
    expect(blob).not.toMatch(/https?:\/\//i);
    expect(blob).not.toMatch(/supabase\.co/i);
    expect(blob).not.toMatch(/JWT_SECRET|SERVICE_ROLE|ANON_KEY|jwks\.json/i);
    expect(blob).not.toMatch(/CLAWQL_SUPABASE_/);
  });
});
