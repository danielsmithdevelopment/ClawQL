import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

function fakeChild(exitCode: number, stdout = ""): import("node:child_process").ChildProcess {
  const child = new EventEmitter() as import("node:child_process").ChildProcess;
  const sout = new EventEmitter();
  const serr = new EventEmitter();
  Object.assign(child, { stdout: sout, stderr: serr });
  setImmediate(() => {
    if (stdout) sout.emit("data", Buffer.from(stdout));
    child.emit("close", exitCode);
  });
  return child;
}

const mockSpawn = vi.hoisted(() => vi.fn((_cmd: string, _args: string[]) => fakeChild(0, "42\n")));

vi.mock("node:child_process", async (importOriginal) => {
  const cp = await importOriginal<typeof import("node:child_process")>();
  return {
    ...cp,
    spawn: (...args: Parameters<typeof cp.spawn>) => mockSpawn(...args),
  };
});

import { callDockerSandbox } from "./sandbox-container.js";

describe("sandbox-container", () => {
  afterEach(() => {
    mockSpawn.mockClear();
  });

  it("invokes docker CLI with --network none and returns backend docker", async () => {
    const r = await callDockerSandbox({
      code: "print(40+2)",
      language: "python",
      persistenceMode: "ephemeral",
    });
    expect(r.success).toBe(true);
    expect(r.backend).toBe("docker");
    expect(r.stdout).toContain("42");
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("docker");
    expect(args).toContain("run");
    expect(args).toContain("--network");
    expect(args).toContain("none");
    expect(args).toContain("python:3.12-alpine");
  });
});
