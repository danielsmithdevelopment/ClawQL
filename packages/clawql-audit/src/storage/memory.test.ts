import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { WORMEntry } from "../entry.js";
import { MemoryBackend } from "./memory.js";

function entry(i: number): WORMEntry {
  return {
    id: `e-${i}`,
    hash: `h-${i}`,
    prevHash: i === 0 ? "genesis" : `h-${i - 1}`,
    chainIndex: i,
    writtenAt: new Date(i * 1000).toISOString(),
    backendAcks: ["local"],
    type: "TOOL_CALL_ATTEMPT",
    timestamp: new Date(i * 1000).toISOString(),
    sessionId: "sess",
    metadata: { i },
  };
}

describe("MemoryBackend maxEntries", () => {
  it("retains only the newest N entries", async () => {
    const backend = new MemoryBackend({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      await Effect.runPromise(backend.write(entry(i)));
    }
    const all = await Effect.runPromise(backend.all());
    expect(all.map((e) => e.chainIndex)).toEqual([2, 3, 4]);
  });

  it("is unbounded when maxEntries is 0", async () => {
    const backend = new MemoryBackend({ maxEntries: 0 });
    for (let i = 0; i < 5; i++) {
      await Effect.runPromise(backend.write(entry(i)));
    }
    const all = await Effect.runPromise(backend.all());
    expect(all).toHaveLength(5);
  });
});
