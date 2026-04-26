import { afterEach, describe, expect, it, vi } from "vitest";
import { startSeedsPoller } from "./poller.js";
import type { Seed } from "./seed.js";

function makeSeed(seedId: string): Seed {
  return {
    goal: "poller test",
    task_type: "analysis",
    brownfield_context: {
      project_type: "greenfield",
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
    },
    constraints: [],
    acceptance_criteria: [],
    ontology_schema: { name: "o", description: "d", fields: [] },
    evaluation_principles: [],
    exit_conditions: [],
    metadata: {
      seed_id: seedId,
      version: "1.0.0",
      created_at: new Date(),
      ambiguity_score: 0.1,
      interview_id: null,
      parent_seed_id: null,
    },
  };
}

describe("startSeedsPoller", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs pending seeds and marks failures", async () => {
    vi.useFakeTimers();
    const okSeed = makeSeed("ok-seed");
    const badSeed = makeSeed("bad-seed");
    const run = vi.fn(async (seed: Seed) => {
      if (seed.metadata.seed_id === "bad-seed") throw new Error("boom");
    });
    const fetchPending = vi.fn(async () => [okSeed, badSeed]);
    const markFailed = vi.fn(async () => {});
    const onError = vi.fn(async () => {});

    const poller = startSeedsPoller(
      { run } as never,
      fetchPending,
      markFailed,
      { pollIntervalMs: 10, onError },
    );

    await vi.advanceTimersByTimeAsync(12);

    expect(fetchPending).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(markFailed).toHaveBeenCalledWith("bad-seed", expect.any(Error));
    expect(onError).toHaveBeenCalledWith(badSeed, expect.any(Error));

    poller.stop();
  });

  it("skips overlapping polls while prior run is in flight", async () => {
    vi.useFakeTimers();
    const seed = makeSeed("slow-seed");
    let resolveRun: (() => void) | null = null;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve;
        }),
    );
    const fetchPending = vi.fn(async () => [seed]);
    const markFailed = vi.fn(async () => {});
    const poller = startSeedsPoller(
      { run } as never,
      fetchPending,
      markFailed,
      { pollIntervalMs: 10 },
    );

    await vi.advanceTimersByTimeAsync(12);
    await vi.advanceTimersByTimeAsync(25);
    expect(fetchPending).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);

    resolveRun?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(12);

    expect(fetchPending).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(2);
    poller.stop();
  });
});
