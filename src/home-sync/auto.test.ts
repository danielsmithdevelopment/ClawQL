import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  autoPullEnabled,
  autoPushExplicitlyEnabled,
  flushPendingAutoPush,
  resetHomeSyncAutoForTests,
  scheduleAutoPushAfterIngest,
} from "./auto.js";

vi.mock("./engine.js", () => {
  const { Effect } = require("effect") as typeof import("effect");
  const runSyncPush = vi.fn(async () => ({
    provider: "r2",
    bucket: "test",
    prefix: "",
    uploaded: 1,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    dryRun: false,
    actions: [],
  }));
  const runSyncPull = vi.fn(async () => ({
    provider: "r2",
    bucket: "test",
    prefix: "",
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    dryRun: false,
    actions: [],
  }));
  return {
    runSyncPush,
    runSyncPull,
    runSyncPushEffect: () => Effect.promise(() => runSyncPush()),
    runSyncPullEffect: () => Effect.promise(() => runSyncPull()),
  };
});

vi.mock("./config.js", () => {
  const { Effect } = require("effect") as typeof import("effect");
  const loadResolvedHomeSyncConfig = vi.fn(async () => ({
    version: 1,
    provider: "r2",
    bucket: "test",
    home: "/tmp",
    include: ["Memory"],
    manifestKey: ".clawql/sync/manifest.v1.json",
  }));
  return {
    loadResolvedHomeSyncConfig,
    loadResolvedHomeSyncConfigEffect: () => Effect.promise(() => loadResolvedHomeSyncConfig()),
  };
});

describe("home-sync auto", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetHomeSyncAutoForTests();
    delete process.env.CLAWQL_SYNC_AUTO;
    delete process.env.CLAWQL_SYNC_AUTO_PULL;
    delete process.env.CLAWQL_SYNC_AUTO_DEBOUNCE_MS;
    delete process.env.CLAWQL_SYNC_AUTO_PUSH_MIN_MS;
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

  it("debounces a quiet period before the first push", async () => {
    process.env.CLAWQL_SYNC_AUTO = "1";
    process.env.CLAWQL_SYNC_AUTO_DEBOUNCE_MS = "5000";
    process.env.CLAWQL_SYNC_AUTO_PUSH_MIN_MS = "0";
    const { runSyncPush } = await import("./engine.js");
    scheduleAutoPushAfterIngest();
    expect(runSyncPush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4999);
    expect(runSyncPush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runSyncPush).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid ingests into one push after quiet", async () => {
    process.env.CLAWQL_SYNC_AUTO = "1";
    process.env.CLAWQL_SYNC_AUTO_DEBOUNCE_MS = "2000";
    process.env.CLAWQL_SYNC_AUTO_PUSH_MIN_MS = "0";
    const { runSyncPush } = await import("./engine.js");
    scheduleAutoPushAfterIngest();
    await vi.advanceTimersByTimeAsync(500);
    scheduleAutoPushAfterIngest();
    await vi.advanceTimersByTimeAsync(500);
    scheduleAutoPushAfterIngest();
    expect(runSyncPush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(runSyncPush).toHaveBeenCalledTimes(1);
  });

  it("rate-limits sustained ingest so pushes are not every couple seconds", async () => {
    process.env.CLAWQL_SYNC_AUTO = "1";
    process.env.CLAWQL_SYNC_AUTO_DEBOUNCE_MS = "100";
    process.env.CLAWQL_SYNC_AUTO_PUSH_MIN_MS = "30000";
    const { runSyncPush } = await import("./engine.js");

    scheduleAutoPushAfterIngest();
    await vi.advanceTimersByTimeAsync(100);
    expect(runSyncPush).toHaveBeenCalledTimes(1);

    // More writes soon after — must wait out min interval, not push again at 100ms.
    scheduleAutoPushAfterIngest();
    await vi.advanceTimersByTimeAsync(100);
    expect(runSyncPush).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(29_900);
    expect(runSyncPush).toHaveBeenCalledTimes(2);
  });

  it("flushPendingAutoPush pushes immediately even inside min-interval window", async () => {
    process.env.CLAWQL_SYNC_AUTO = "1";
    process.env.CLAWQL_SYNC_AUTO_DEBOUNCE_MS = "60000";
    process.env.CLAWQL_SYNC_AUTO_PUSH_MIN_MS = "60000";
    const { runSyncPush } = await import("./engine.js");

    scheduleAutoPushAfterIngest();
    expect(runSyncPush).not.toHaveBeenCalled();
    await flushPendingAutoPush();
    expect(runSyncPush).toHaveBeenCalledTimes(1);

    // Second ingest inside throttle window — shutdown flush still uploads.
    scheduleAutoPushAfterIngest();
    await flushPendingAutoPush();
    expect(runSyncPush).toHaveBeenCalledTimes(2);
  });

  it("flushPendingAutoPush is a no-op when nothing is pending", async () => {
    process.env.CLAWQL_SYNC_AUTO = "1";
    const { runSyncPush } = await import("./engine.js");
    await flushPendingAutoPush();
    expect(runSyncPush).not.toHaveBeenCalled();
  });
});
