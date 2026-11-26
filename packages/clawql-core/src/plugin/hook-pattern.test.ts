import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { ClawQLError } from "../errors/clawql-error.js";
import {
  compileToolPattern,
  toolMatchesPattern,
  unmatchedBlockingToolHooks,
} from "./hook-runtime.js";
import { InMemoryHookRegistryLive, validateLifecycleHook } from "./hook-registry.js";
import { HookRegistry, type LifecycleHook } from "./provider-types.js";

function toolHook(overrides: Partial<LifecycleHook> & Pick<LifecycleHook, "id">): LifecycleHook {
  return {
    scope: "tool",
    event: "pre-execute",
    toolPattern: "demo_.*",
    blocking: true,
    handler: () => Effect.succeed({ allow: true }),
    ...overrides,
  };
}

describe("compileToolPattern / toolMatchesPattern (audit 2.15)", () => {
  it("anchors patterns to the full tool name", async () => {
    const re = await Effect.runPromise(compileToolPattern("demo_.*"));
    expect(toolMatchesPattern("demo_ping", re)).toBe(true);
    expect(toolMatchesPattern("demo_ping", "demo_.*")).toBe(true);
    // Substring-only match must not succeed once anchored.
    expect(toolMatchesPattern("xdemo_ping", re)).toBe(false);
    expect(toolMatchesPattern("demo_ping_extra", "demo_ping")).toBe(false);
  });

  it("rejects empty and invalid regex at compile time", async () => {
    const empty = await Effect.runPromiseExit(compileToolPattern("   "));
    expect(Exit.isFailure(empty)).toBe(true);

    const invalid = await Effect.runPromiseExit(compileToolPattern("["));
    expect(Exit.isFailure(invalid)).toBe(true);
    if (Exit.isFailure(invalid)) {
      const err = Cause.squash(invalid.cause);
      expect(err).toBeInstanceOf(ClawQLError);
      expect((err as ClawQLError).reason).toMatch(/Invalid toolPattern regex/);
    }
  });

  it("toolMatchesPattern does not silently swallow invalid string patterns", () => {
    expect(() => toolMatchesPattern("demo_ping", "[")).toThrow();
  });
});

describe("HookRegistry toolPattern registration (audit 2.15)", () => {
  it("fails registration for invalid toolPattern on a blocking hook", async () => {
    const program = Effect.gen(function* () {
      const reg = yield* HookRegistry;
      yield* reg.register("bad-plugin", [
        toolHook({ id: "broken", toolPattern: "[unterminated", blocking: true }),
      ]);
    }).pipe(Effect.provide(InMemoryHookRegistryLive));

    const exit = await Effect.runPromiseExit(program);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const err = Cause.squash(exit.cause);
      expect(err).toBeInstanceOf(ClawQLError);
      expect((err as ClawQLError).reason).toMatch(/Hook broken:.*Invalid toolPattern/);
    }
  });

  it("fails validateLifecycleHook for invalid toolPattern before install", async () => {
    const exit = await Effect.runPromiseExit(
      validateLifecycleHook(toolHook({ id: "precheck", toolPattern: "[" }))
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("stores a compiled matcher and lists only full-name matches", async () => {
    const program = Effect.gen(function* () {
      const reg = yield* HookRegistry;
      yield* reg.register("demo", [toolHook({ id: "demo-pre", toolPattern: "demo_.*" })]);
      const hit = yield* reg.list("pre-execute", "demo_ping");
      const miss = yield* reg.list("pre-execute", "xdemo_ping");
      return { hit, miss };
    }).pipe(Effect.provide(InMemoryHookRegistryLive));

    const { hit, miss } = await Effect.runPromise(program);
    expect(hit).toHaveLength(1);
    expect(hit[0]?.toolPatternRegex).toBeInstanceOf(RegExp);
    expect(miss).toHaveLength(0);
  });

  it("rejects tool-scope hooks missing toolPattern", async () => {
    const exit = await Effect.runPromiseExit(
      validateLifecycleHook(toolHook({ id: "missing", toolPattern: undefined }))
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("listAll + unmatchedBlockingToolHooks warn when pattern matches no tool", async () => {
    const program = Effect.gen(function* () {
      const reg = yield* HookRegistry;
      yield* reg.register("demo", [
        toolHook({ id: "typo-hook", toolPattern: "execute_typo" }),
        toolHook({ id: "ok-hook", toolPattern: "execute" }),
        toolHook({ id: "non-blocking", toolPattern: "missing_.*", blocking: false }),
      ]);
      return yield* reg.listAll();
    }).pipe(Effect.provide(InMemoryHookRegistryLive));

    const hooks = await Effect.runPromise(program);
    const unmatched = unmatchedBlockingToolHooks(hooks, ["execute", "search", "cache"]);
    expect(unmatched.map((u) => u.hookId)).toEqual(["typo-hook"]);
  });
});
