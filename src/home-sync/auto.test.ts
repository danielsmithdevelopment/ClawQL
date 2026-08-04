import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  autoPullEnabled,
  autoPushExplicitlyEnabled,
  resetHomeSyncAutoForTests,
  scheduleAutoPushAfterIngest,
} from "./auto.js";

vi.mock("./engine.js", () => ({
  runSyncPush: vi.fn(async () => ({
    provider: "r2",
    bucket: "test",
    prefix: "",
    uploaded: 1,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    dryRun: false,
    actions: [],
  })),
  runSyncPull: vi.fn(async () => ({
    provider: "r2",
    bucket: "test",
    prefix: "",
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    dryRun: false,
    actions: [],
  })),
}));

vi.mock("./config.js", () => ({
  loadResolvedHomeSyncConfig: vi.fn(async () => ({
    version: 1,
    provider: "r2",
    bucket: "test",
    home: "/tmp",
    include: ["Memory"],
    manifestKey: ".clawql/sync/manifest.v1.json",
  })),
}));

describe("home-sync auto", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetHomeSyncAutoForTests();
    delete process.env.CLAWQL_SYNC_AUTO;
    delete process.env.CLAWQL_SYNC_AUTO_PULL;
    delete process.env.CLAWQL_SYNC_AUTO_DEBOUNCE_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
    resetHomeSyncAutoForTests();
  });

  it("autoPushExplicitlyEnabled respects CLAWQL_SYNC_AUTO", () => {
    expect(autoPushExplicitlyEnabled()).toBe(false);
    process.env.CLAWQL_SYNC_AUTO = "1";
    expect(autoPushExplicitlyEnabled()).toBe(true);
    process.env.CLAWQL_SYNC_AUTO = "0";
    expect(autoPushExplicitlyEnabled()).toBe(false);
  });

  it("autoPullEnabled respects CLAWQL_SYNC_AUTO_PULL", () => {
    expect(autoPullEnabled()).toBe(false);
    process.env.CLAWQL_SYNC_AUTO_PULL = "1";
    expect(autoPullEnabled()).toBe(true);
  });

  it("scheduleAutoPushAfterIngest debounces push", async () => {
    process.env.CLAWQL_SYNC_AUTO = "1";
    process.env.CLAWQL_SYNC_AUTO_DEBOUNCE_MS = "5000";
    const { runSyncPush } = await import("./engine.js");
    scheduleAutoPushAfterIngest();
    expect(runSyncPush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4999);
    expect(runSyncPush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runSyncPush).toHaveBeenCalledTimes(1);
  });

  it("defaults to 2s debounce when CLAWQL_SYNC_AUTO_DEBOUNCE_MS unset", async () => {
    process.env.CLAWQL_SYNC_AUTO = "1";
    delete process.env.CLAWQL_SYNC_AUTO_DEBOUNCE_MS;
    const { runSyncPush } = await import("./engine.js");
    const { scheduleAutoPushAfterIngest: schedule, DEFAULT_AUTO_PUSH_DEBOUNCE_MS } =
      await import("./auto.js");
    expect(DEFAULT_AUTO_PUSH_DEBOUNCE_MS).toBe(2_000);
    schedule();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(runSyncPush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runSyncPush).toHaveBeenCalledTimes(1);
  });

  it("flushPendingAutoPush cancels debounce and pushes immediately", async () => {
    process.env.CLAWQL_SYNC_AUTO = "1";
    process.env.CLAWQL_SYNC_AUTO_DEBOUNCE_MS = "60000";
    const { runSyncPush } = await import("./engine.js");
    const { scheduleAutoPushAfterIngest: schedule, flushPendingAutoPush } =
      await import("./auto.js");
    schedule();
    expect(runSyncPush).not.toHaveBeenCalled();
    await flushPendingAutoPush();
    expect(runSyncPush).toHaveBeenCalledTimes(1);
  });
});
