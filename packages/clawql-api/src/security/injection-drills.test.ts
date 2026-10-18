import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  injectionDrillLayer,
  InjectionDrillService,
  parseInjectionMode,
  runInjectionDrillsEffect,
} from "./injection-drills.js";

describe("injection drills", () => {
  it("parseInjectionMode accepts the three modes", () => {
    expect(parseInjectionMode("direct")).toBe("direct");
    expect(parseInjectionMode("INDIRECT")).toBe("indirect");
    expect(parseInjectionMode("multistep")).toBe("multistep");
    expect(parseInjectionMode("other")).toBeNull();
  });

  it("direct mode blocks memory_ingest payloads", async () => {
    const report = await Effect.runPromise(runInjectionDrillsEffect("direct", { env: {} }));
    expect(report.failed).toBe(0);
    expect(report.passed).toBeGreaterThan(0);
    expect(report.cases.every((c) => c.blocked)).toBe(true);
  });

  it("indirect mode blocks smuggled tool calls via memory_ingest", async () => {
    const report = await Effect.runPromise(runInjectionDrillsEffect("indirect", { env: {} }));
    expect(report.failed).toBe(0);
    expect(report.cases[0]?.blocked).toBe(true);
  });

  it("multistep allows recall then blocks ingest hijack", async () => {
    const report = await Effect.runPromise(runInjectionDrillsEffect("multistep", { env: {} }));
    expect(report.failed).toBe(0);
    expect(report.cases.find((c) => c.id === "multistep-turn1-benign")?.blocked).toBe(false);
    expect(report.cases.find((c) => c.id === "multistep-turn2-hijack")?.blocked).toBe(true);
  });

  it("remote --target is fail-closed until wired", async () => {
    const report = await Effect.runPromise(
      runInjectionDrillsEffect("direct", { target: "https://staging.example/mcp", env: {} })
    );
    expect(report.failed).toBe(1);
    expect(report.honesty).toContain("not wired");
  });

  it("InjectionDrillService layer runs", async () => {
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* InjectionDrillService;
        return yield* svc.run("direct");
      }).pipe(Effect.provide(injectionDrillLayer({})))
    );
    expect(report.passed).toBeGreaterThan(0);
  });
});
