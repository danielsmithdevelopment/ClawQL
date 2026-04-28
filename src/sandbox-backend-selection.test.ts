import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseExplicitSandboxBackendEnv,
  resolveSandboxBackendChoice,
  type SandboxBackendAutoDeps,
} from "./sandbox-backend-selection.js";

describe("parseExplicitSandboxBackendEnv", () => {
  const saved = process.env.CLAWQL_SANDBOX_BACKEND;

  beforeEach(() => {
    delete process.env.CLAWQL_SANDBOX_BACKEND;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.CLAWQL_SANDBOX_BACKEND;
    else process.env.CLAWQL_SANDBOX_BACKEND = saved;
  });

  it("defaults unset to bridge (non-breaking)", () => {
    expect(parseExplicitSandboxBackendEnv()).toBe("bridge");
  });

  it("auto enables cascade", () => {
    process.env.CLAWQL_SANDBOX_BACKEND = "auto";
    expect(parseExplicitSandboxBackendEnv()).toBeNull();
  });
});

describe("resolveSandboxBackendChoice", () => {
  const depsAllTrue: SandboxBackendAutoDeps = {
    seatbelt: () => true,
    docker: async () => true,
    bridge: () => true,
  };

  it("explicit bridge bypasses auto", async () => {
    const r = await resolveSandboxBackendChoice("bridge", depsAllTrue);
    expect(r).toEqual({ ok: true, backend: "bridge" });
  });

  it("auto prefers seatbelt when available", async () => {
    const r = await resolveSandboxBackendChoice(null, depsAllTrue);
    expect(r).toEqual({ ok: true, backend: "macos-seatbelt" });
  });

  it("auto uses docker when seatbelt unavailable", async () => {
    const deps: SandboxBackendAutoDeps = {
      seatbelt: () => false,
      docker: async () => true,
      bridge: () => true,
    };
    const r = await resolveSandboxBackendChoice(null, deps);
    expect(r).toEqual({ ok: true, backend: "docker" });
  });

  it("auto uses bridge when only bridge is configured", async () => {
    const deps: SandboxBackendAutoDeps = {
      seatbelt: () => false,
      docker: async () => false,
      bridge: () => true,
    };
    const r = await resolveSandboxBackendChoice(null, deps);
    expect(r).toEqual({ ok: true, backend: "bridge" });
  });

  it("auto fails when nothing is available", async () => {
    const deps: SandboxBackendAutoDeps = {
      seatbelt: () => false,
      docker: async () => false,
      bridge: () => false,
    };
    const r = await resolveSandboxBackendChoice(null, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(40);
  });
});
