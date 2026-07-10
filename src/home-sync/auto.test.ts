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
    resetHomeSyncAutoForTests();
    delete process.env.CLAWQL_SYNC_AUTO;
    delete process.env.CLAWQL_SYNC_AUTO_PULL;
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
    await vi.advanceTimersByTimeAsync(5000);
    expect(runSyncPush).toHaveBeenCalledTimes(1);
  });
});
