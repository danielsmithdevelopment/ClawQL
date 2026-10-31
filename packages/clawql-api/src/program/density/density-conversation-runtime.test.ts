import { mkdtemp } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { makeDensityConversationRuntime } from "./density-conversation-runtime.js";
import { INFINITY_MATCHED_TURNS } from "./infinity-matched-shape.js";

describe("DensityConversationRuntime park/wake", () => {
  it("parks to dens_*.json, wakes messages back, and re-parks", async () => {
    const bagDir = await mkdtemp(join(tmpdir(), "clawql-dens-rt-"));
    const rt = makeDensityConversationRuntime(bagDir);

    const id = await Effect.runPromise(rt.createAgent(0));
    expect(id.startsWith("dens_")).toBe(true);

    const driven = await Effect.runPromise(rt.driveAllTurns(id, INFINITY_MATCHED_TURNS));
    expect(driven.messageCount).toBe(100);
    expect(driven.serializedBytes).toBeGreaterThan(50_000);

    const parked = await Effect.runPromise(rt.parkOffloaded(id));
    expect(parked.diskBytes).toBeGreaterThan(50_000);
    expect(existsSync(rt.bagPath(id))).toBe(true);
    expect(rt.bagPath(id)).toMatch(/dens_.*\.json$/);

    const bagRaw = JSON.parse(readFileSync(rt.bagPath(id), "utf8")) as {
      contract: string;
      messages: unknown[];
      status: string;
    };
    expect(bagRaw.contract).toBe("infinity-agent-scale-matched-v2");
    expect(bagRaw.status).toBe("parked");
    expect(bagRaw.messages).toHaveLength(100);

    // After park, in-process messages are empty (ids-only).
    await expect(Effect.runPromise(rt.driveTurn(id, 0))).rejects.toThrow(/non-resident/);

    const woke = await Effect.runPromise(rt.wake(id));
    expect(woke.messageCount).toBe(100);
    expect(woke.diskBytes).toBe(parked.diskBytes);
    expect(woke.turnsCompleted).toBe(INFINITY_MATCHED_TURNS);

    const residentCount = await Effect.runPromise(rt.messageCount(id));
    expect(residentCount).toBe(100);

    // Re-park for warm/cold sample loops.
    const parked2 = await Effect.runPromise(rt.parkOffloaded(id));
    expect(parked2.diskBytes).toBe(parked.diskBytes);

    await Effect.runPromise(rt.clear());
    expect(existsSync(bagDir)).toBe(false);
  });

  it("rejects wake on resident agents", async () => {
    const bagDir = await mkdtemp(join(tmpdir(), "clawql-dens-rt-"));
    const rt = makeDensityConversationRuntime(bagDir);
    const id = await Effect.runPromise(rt.createAgent(1));
    await Effect.runPromise(rt.driveAllTurns(id, 1));
    await expect(Effect.runPromise(rt.wake(id))).rejects.toThrow(/non-offloaded/);
  });

  it("rolls back probe turns without leaving history growth", async () => {
    const bagDir = await mkdtemp(join(tmpdir(), "clawql-dens-rt-"));
    const rt = makeDensityConversationRuntime(bagDir);
    const id = await Effect.runPromise(rt.createAgent(2));
    await Effect.runPromise(rt.driveAllTurns(id, 2));
    const before = await Effect.runPromise(rt.messageCount(id));
    await Effect.runPromise(rt.driveTurn(id, 2));
    const mid = await Effect.runPromise(rt.messageCount(id));
    expect(mid).toBe(before + 5);
    const rolled = await Effect.runPromise(rt.rollbackMessages(id, 5));
    expect(rolled.messageCount).toBe(before);
    expect(await Effect.runPromise(rt.messageCount(id))).toBe(before);
  });
});
