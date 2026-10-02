/**
 * Unit tests for toolkit registry resolve / seeded catalog.
 */

import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getToolkitEffect,
  listToolkitsEffect,
  readToolkitIdFromInstanceEnvEffect,
  resolveToolkitToProvidersComposition,
} from "./toolkit-service.js";
import { SEEDED_TOOLKITS } from "./seeded-toolkits.js";

describe("toolkit registry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists seeded toolkits", () => {
    const list = Effect.runSync(listToolkitsEffect());
    expect(list.map((t) => t.id).sort()).toEqual(
      ["default-saas", "ops-github-slack", "read-only"].sort()
    );
    expect(list).toHaveLength(SEEDED_TOOLKITS.length);
  });

  it("resolves default-saas to pack default + SaaS ATR tools", () => {
    const composition = Effect.runSync(resolveToolkitToProvidersComposition("default-saas"));
    expect(composition).toEqual({ pack: "default" });
    const tk = Effect.runSync(getToolkitEffect("default-saas"));
    expect(tk.atrToolsInScope).toEqual(
      expect.arrayContaining([
        "search",
        "execute",
        "cache",
        "audit",
        "skills_list",
        "skills_get",
        "memory_ingest",
        "memory_recall",
      ])
    );
    expect(tk.apiKeyScopes).toEqual(["search", "execute", "memory", "audit"]);
  });

  it("resolves read-only with limited ATR tools", () => {
    const composition = Effect.runSync(resolveToolkitToProvidersComposition("read-only"));
    expect(composition).toEqual({ pack: "default" });
    const tk = Effect.runSync(getToolkitEffect("READ-ONLY"));
    expect(tk.atrToolsInScope).toEqual(["search", "memory_recall", "skills_list", "skills_get"]);
    expect(tk.atrToolsInScope).not.toContain("execute");
    expect(tk.apiKeyScopes).toEqual(["search", "memory"]);
  });

  it("resolves ops-github-slack to enabled github+slack", () => {
    const composition = Effect.runSync(resolveToolkitToProvidersComposition("ops-github-slack"));
    expect(composition).toEqual({ enabled: ["github", "slack"] });
    expect(composition.pack).toBeUndefined();
  });

  it("fails get/resolve for unknown id", () => {
    const exit = Effect.runSyncExit(getToolkitEffect("not-a-toolkit"));
    expect(exit._tag).toBe("Failure");
    const exit2 = Effect.runSyncExit(resolveToolkitToProvidersComposition("missing"));
    expect(exit2._tag).toBe("Failure");
  });

  it("reads toolkit id from CLAWQL_INSTANCE_SPEC", () => {
    vi.stubEnv("CLAWQL_INSTANCE_SPEC", JSON.stringify({ toolkit: "default-saas" }));
    expect(Effect.runSync(readToolkitIdFromInstanceEnvEffect())).toBe("default-saas");
  });

  it("reads toolkit under nested spec object", () => {
    vi.stubEnv("CLAWQL_INSTANCE_SPEC", JSON.stringify({ spec: { toolkit: "read-only" } }));
    expect(Effect.runSync(readToolkitIdFromInstanceEnvEffect())).toBe("read-only");
  });
});
