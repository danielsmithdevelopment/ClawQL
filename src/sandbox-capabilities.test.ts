import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: hoisted.spawnMock,
  };
});

import {
  bridgeCredentialsConfigured,
  dockerCliReachable,
  resetSandboxDockerProbeForTest,
  seatbeltBinaryPresent,
} from "./sandbox-capabilities.js";

describe("sandbox-capabilities", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    Object.assign(saved, process.env);
    resetSandboxDockerProbeForTest();
    hoisted.spawnMock.mockReset();
    delete process.env.CLAWQL_SANDBOX_BRIDGE_URL;
    delete process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN;
    delete process.env.CLAWQL_SANDBOX_DOCKER_BIN;
  });

  afterEach(() => {
    process.env = { ...saved };
    resetSandboxDockerProbeForTest();
    hoisted.spawnMock.mockReset();
    vi.clearAllMocks();
  });

  it("bridgeCredentialsConfigured is false when URL or token missing", () => {
    expect(bridgeCredentialsConfigured()).toBe(false);
    process.env.CLAWQL_SANDBOX_BRIDGE_URL = "https://bridge.example";
    expect(bridgeCredentialsConfigured()).toBe(false);
    process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN = "secret";
    expect(bridgeCredentialsConfigured()).toBe(true);
  });

  it("seatbeltBinaryPresent is false off darwin", () => {
    if (process.platform !== "darwin") {
      expect(seatbeltBinaryPresent()).toBe(false);
    } else {
      expect(typeof seatbeltBinaryPresent()).toBe("boolean");
    }
  });

  it("dockerCliReachable caches probe result", async () => {
    const mockChild = {
      on: vi.fn((event: string, cb: (code?: number) => void) => {
        if (event === "close") {
          queueMicrotask(() => cb(0));
        }
        return mockChild;
      }),
    };
    hoisted.spawnMock.mockReturnValue(mockChild as never);

    const a = await dockerCliReachable();
    const b = await dockerCliReachable();
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(hoisted.spawnMock).toHaveBeenCalledTimes(1);
  });

  it("dockerCliReachable resolves false when docker CLI exits non-zero", async () => {
    resetSandboxDockerProbeForTest();
    const mockChild = {
      on: vi.fn((event: string, cb: (code?: number) => void) => {
        if (event === "close") {
          queueMicrotask(() => cb(1));
        }
        return mockChild;
      }),
    };
    hoisted.spawnMock.mockReturnValue(mockChild as never);
    expect(await dockerCliReachable()).toBe(false);
  });
});
