import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { ClawQLError } from "../errors/clawql-error.js";
import { assertProviderPlugin, loadPluginModuleEffect } from "./dynamic-loader.js";
import { defineProviderPlugin, defineStandaloneSkillPlugin } from "./plugin-installer.js";

function dataModuleUrl(source: string): string {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

describe("loadPluginModuleEffect", () => {
  it("loads providerPlugin export from a data: module", async () => {
    const url = dataModuleUrl(`
      export const providerPlugin = {
        id: "dyn-provider",
        version: "1.0.0",
        description: "fixture",
        tools: [],
        install: () => ({}),
        uninstall: () => ({}),
      };
    `);
    const plugin = await Effect.runPromise(loadPluginModuleEffect(url));
    expect(plugin.id).toBe("dyn-provider");
  });

  it("falls back to plugin then default exports", async () => {
    const viaPlugin = await Effect.runPromise(
      loadPluginModuleEffect(
        dataModuleUrl(
          `export const plugin = { id: "via-plugin", version: "0.0.1", description: "p" };`
        )
      )
    );
    expect(viaPlugin.id).toBe("via-plugin");

    const viaDefault = await Effect.runPromise(
      loadPluginModuleEffect(
        dataModuleUrl(`export default { id: "via-default", version: "0.0.1", description: "d" };`)
      )
    );
    expect(viaDefault.id).toBe("via-default");
  });

  it("fails when module exports no AnyPlugin shape", async () => {
    const exit = await Effect.runPromiseExit(
      loadPluginModuleEffect(dataModuleUrl(`export const nope = 1;`))
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const squashed = Cause.squash(exit.cause) as ClawQLError;
      expect(squashed).toBeInstanceOf(ClawQLError);
      expect(squashed.reason).toMatch(/Failed to load plugin module/);
    }
  });

  it("fails when the module specifier cannot be imported", async () => {
    const exit = await Effect.runPromiseExit(
      loadPluginModuleEffect("data:text/javascript,throw new Error('boom');")
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const squashed = Cause.squash(exit.cause) as ClawQLError;
      expect(squashed).toBeInstanceOf(ClawQLError);
      expect(squashed.reason).toMatch(/Failed to load plugin module/);
    }
  });
});

describe("assertProviderPlugin", () => {
  it("accepts a ProviderPlugin", async () => {
    const plugin = defineProviderPlugin({
      id: "assert-ok",
      version: "1.0.0",
      description: "ok",
      tools: [],
    });
    const out = await Effect.runPromise(assertProviderPlugin(plugin));
    expect(out.id).toBe("assert-ok");
  });

  it("rejects a StandaloneSkillPlugin", async () => {
    const standalone = defineStandaloneSkillPlugin({
      id: "assert-skill",
      version: "1.0.0",
      description: "skill only",
      skills: [{ skillId: "s1", content: "# skill" }],
    });
    const exit = await Effect.runPromiseExit(assertProviderPlugin(standalone));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const squashed = Cause.squash(exit.cause) as ClawQLError;
      expect(squashed).toBeInstanceOf(ClawQLError);
      expect(squashed.reason).toMatch(/StandaloneSkillPlugin/);
    }
  });
});
