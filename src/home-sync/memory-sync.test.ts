import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMemorySync } from "./memory-sync.js";
import type { SyncRunResult } from "./types.js";

const statusMock = vi.fn();
const pullMock = vi.fn();
const pushMock = vi.fn();

vi.mock("./engine.js", () => ({
  runSyncStatus: (...args: unknown[]) => statusMock(...args),
  runSyncPull: (...args: unknown[]) => pullMock(...args),
  runSyncPush: (...args: unknown[]) => pushMock(...args),
}));

function run(overrides: Partial<SyncRunResult> = {}): SyncRunResult {
  return {
    provider: "r2",
    bucket: "team",
    prefix: "tenant/a/",
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    dryRun: false,
    actions: [],
    ...overrides,
  };
}

describe("runMemorySync", () => {
  beforeEach(() => {
    statusMock.mockReset();
    pullMock.mockReset();
    pushMock.mockReset();
    statusMock.mockResolvedValue({
      config: { provider: "r2", bucket: "team", prefix: "tenant/a/" },
      localCount: 1,
      remoteCount: 1,
      inSync: 0,
      localOnly: ["Memory/local.md"],
      remoteOnly: ["Memory/remote.md"],
      conflicts: [],
    });
  });

  it("auto pulls then pushes by default", async () => {
    pullMock.mockResolvedValue(
      run({
        downloaded: 2,
        actions: [{ path: "Memory/remote.md", action: "download", reason: "new" }],
      })
    );
    pushMock.mockResolvedValue(
      run({
        uploaded: 1,
        actions: [{ path: "Memory/local.md", action: "upload", reason: "new" }],
      })
    );

    const result = await runMemorySync();

    expect(pullMock).toHaveBeenCalledWith({ force: false, dryRun: false });
    expect(pushMock).toHaveBeenCalledWith({ force: false, dryRun: false });
    expect(result.direction).toBe("auto");
    expect(result.pulled).toBe(2);
    expect(result.pushed).toBe(1);
    expect(result.ok).toBe(true);
  });

  it("pull only skips push", async () => {
    pullMock.mockResolvedValue(run({ downloaded: 1 }));
    const result = await runMemorySync({ direction: "pull" });
    expect(pullMock).toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(1);
  });

  it("push only skips pull", async () => {
    pushMock.mockResolvedValue(run({ uploaded: 3 }));
    const result = await runMemorySync({ direction: "push" });
    expect(pullMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalled();
    expect(result.pushed).toBe(3);
  });

  it("reports conflicts and ok:false", async () => {
    pullMock.mockResolvedValue(
      run({
        actions: [{ path: "Memory/x.md", action: "conflict", reason: "differs" }],
        conflicts: 1,
      })
    );
    pushMock.mockResolvedValue(run());
    const result = await runMemorySync();
    expect(result.ok).toBe(false);
    expect(result.conflicts).toEqual(["Memory/x.md"]);
    expect(result.message).toMatch(/conflict/);
  });

  it("forwards force and dryRun", async () => {
    pullMock.mockResolvedValue(run());
    pushMock.mockResolvedValue(run({ dryRun: true }));
    await runMemorySync({ force: true, dryRun: true });
    expect(pullMock).toHaveBeenCalledWith({ force: true, dryRun: true });
    expect(pushMock).toHaveBeenCalledWith({ force: true, dryRun: true });
  });
});
