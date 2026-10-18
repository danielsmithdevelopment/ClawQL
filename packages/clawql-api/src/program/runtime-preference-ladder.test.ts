import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  INSTALL_BUN_HINT,
  INSTALL_CELLD_HINT,
  NODE_IMPROVE_HINT,
  bunDeclinedFromEnv,
  celldDeclinedFromEnv,
  decideRuntimeLadder,
  resolveRuntimeLadderEffect,
} from "./runtime-preference-ladder.js";

describe("runtime preference ladder", () => {
  it("picks celld when present and not declined", () => {
    const d = decideRuntimeLadder({
      celldPresent: true,
      celldVersion: "0.4.0",
      bunPresent: true,
      bunVersion: "1.4.3",
      celldDeclined: false,
      bunDeclined: false,
    });
    expect(d.tier).toBe("celld");
    expect(d.messages.join(" ")).toMatch(/celld/);
  });

  it("prompts install celld then lands on bun when celld missing", () => {
    const d = decideRuntimeLadder({
      celldPresent: false,
      celldVersion: null,
      bunPresent: true,
      bunVersion: "1.4.3",
      celldDeclined: false,
      bunDeclined: false,
    });
    expect(d.tier).toBe("bun");
    expect(d.messages.some((m) => m.includes(INSTALL_CELLD_HINT.split(":")[0]!))).toBe(true);
    expect(d.messages.join("\n")).toContain(INSTALL_CELLD_HINT);
  });

  it("goes bun when celld declined", () => {
    const d = decideRuntimeLadder({
      celldPresent: true,
      celldVersion: "0.4.0",
      bunPresent: true,
      bunVersion: "1.4.3",
      celldDeclined: true,
      bunDeclined: false,
    });
    expect(d.tier).toBe("bun");
    expect(d.messages.join(" ")).toMatch(/declined/i);
  });

  it("prompts bun install then node with improve hint", () => {
    const d = decideRuntimeLadder({
      celldPresent: false,
      celldVersion: null,
      bunPresent: false,
      bunVersion: null,
      celldDeclined: true,
      bunDeclined: false,
    });
    expect(d.tier).toBe("node");
    expect(d.messages.join("\n")).toContain(INSTALL_BUN_HINT);
    expect(d.messages.join("\n")).toContain(NODE_IMPROVE_HINT);
  });

  it("node when both declined", () => {
    const d = decideRuntimeLadder({
      celldPresent: true,
      celldVersion: "0.4.0",
      bunPresent: true,
      bunVersion: "1.4.3",
      celldDeclined: true,
      bunDeclined: true,
    });
    expect(d.tier).toBe("node");
    expect(d.honesty).toMatch(/legacy/);
  });

  it("env refuse flags", () => {
    expect(celldDeclinedFromEnv({ CLAWQL_DECLINE_CELLD: "1" })).toBe(true);
    expect(celldDeclinedFromEnv({ CLAWQL_CORE_IN_CELLD: "0" })).toBe(true);
    expect(celldDeclinedFromEnv({})).toBe(false);
    expect(bunDeclinedFromEnv({ CLAWQL_DECLINE_BUN: "1" })).toBe(true);
    expect(bunDeclinedFromEnv({})).toBe(false);
  });

  it("resolveRuntimeLadderEffect with injected probes", async () => {
    const d = await Effect.runPromise(
      resolveRuntimeLadderEffect(
        { CLAWQL_DECLINE_CELLD: "1" },
        () =>
          Effect.succeed({
            present: false,
            version: null,
            path: null,
          }),
        () =>
          Effect.succeed({
            present: true,
            version: "1.4.3",
            path: "/tmp/bun",
          })
      )
    );
    expect(d.tier).toBe("bun");
  });
});
