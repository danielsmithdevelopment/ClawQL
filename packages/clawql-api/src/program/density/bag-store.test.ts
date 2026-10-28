import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { clearBagDirEffect, makeParkedBagApi } from "./bag-store.js";
import { buildFairParkedAgentEffect } from "./fair-agent.js";

describe("ParkedBagService file store", () => {
  it("parks, wakes, lists, and reports disk bytes", async () => {
    const bagDir = await mkdtemp(join(tmpdir(), "clawql-density-bags-"));
    await Effect.runPromise(clearBagDirEffect(bagDir));
    const bags = makeParkedBagApi(bagDir);
    const a = await Effect.runPromise(buildFairParkedAgentEffect(1));
    const b = await Effect.runPromise(buildFairParkedAgentEffect(2));
    await Effect.runPromise(bags.park(a));
    await Effect.runPromise(bags.park(b));

    const woke = await Effect.runPromise(bags.wake(a.agentId));
    expect(woke.agentId).toBe(a.agentId);
    expect(woke.turns).toHaveLength(40);

    const ids = await Effect.runPromise(bags.listIds());
    expect(ids).toContain(a.agentId);
    expect(ids).toContain(b.agentId);

    const disk = await Effect.runPromise(bags.diskBytesTotal());
    expect(disk).toBeGreaterThan(40 * 1024);
  });
});
