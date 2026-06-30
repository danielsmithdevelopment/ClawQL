import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseExplicitSandboxBackendEnv,
  resolveSandboxBackendChoice,
  type SandboxBackendAutoDeps,
} from "./backend-selection.js";

describe("parseExplicitSandboxBackendEnv", () => {
  const saved = {
    backend: process.env.CLAWQL_SANDBOX_BACKEND,
    k8sHost: process.env.KUBERNETES_SERVICE_HOST,
  };

  beforeEach(() => {
    delete process.env.CLAWQL_SANDBOX_BACKEND;
    delete process.env.KUBERNETES_SERVICE_HOST;
  });

  afterEach(() => {
    if (saved.backend === undefined) delete process.env.CLAWQL_SANDBOX_BACKEND;
    else process.env.CLAWQL_SANDBOX_BACKEND = saved.backend;
    if (saved.k8sHost === undefined) delete process.env.KUBERNETES_SERVICE_HOST;
    else process.env.KUBERNETES_SERVICE_HOST = saved.k8sHost;
  });

  it("defaults unset off-cluster to bridge", () => {
    expect(parseExplicitSandboxBackendEnv()).toBe("bridge");
  });

  it("defaults unset in-cluster to auto (Kata-first)", () => {
    process.env.KUBERNETES_SERVICE_HOST = "10.0.0.1";
    expect(parseExplicitSandboxBackendEnv()).toBeNull();
  });

  it("auto enables cascade", () => {
    process.env.CLAWQL_SANDBOX_BACKEND = "auto";
    expect(parseExplicitSandboxBackendEnv()).toBeNull();
  });

  it("accepts kata alias", () => {
    process.env.CLAWQL_SANDBOX_BACKEND = "kata-containers";
    expect(parseExplicitSandboxBackendEnv()).toBe("kata");
  });
});

describe("resolveSandboxBackendChoice", () => {
  const depsAllTrue: SandboxBackendAutoDeps = {
    kata: async () => true,
    seatbelt: () => true,
    docker: async () => true,
    bridge: () => true,
  };

  it("explicit bridge bypasses auto", async () => {
    const r = await resolveSandboxBackendChoice("bridge", depsAllTrue);
    expect(r).toEqual({ ok: true, backend: "bridge" });
  });

  it("explicit kata pins kata", async () => {
    const r = await resolveSandboxBackendChoice("kata", depsAllTrue);
    expect(r).toEqual({ ok: true, backend: "kata" });
  });

  it("auto prefers kata when available", async () => {
    const r = await resolveSandboxBackendChoice(null, depsAllTrue);
    expect(r).toEqual({ ok: true, backend: "kata" });
  });

  it("auto uses docker when kata unavailable", async () => {
    const deps: SandboxBackendAutoDeps = {
      kata: async () => false,
      seatbelt: () => true,
      docker: async () => true,
      bridge: () => true,
    };
    const r = await resolveSandboxBackendChoice(null, deps);
    expect(r).toEqual({ ok: true, backend: "docker" });
  });

  it("auto uses bridge when only bridge is configured", async () => {
    const deps: SandboxBackendAutoDeps = {
      kata: async () => false,
      seatbelt: () => false,
      docker: async () => false,
      bridge: () => true,
    };
    const r = await resolveSandboxBackendChoice(null, deps);
    expect(r).toEqual({ ok: true, backend: "bridge" });
  });

  it("auto fails when nothing is available", async () => {
    const deps: SandboxBackendAutoDeps = {
      kata: async () => false,
      seatbelt: () => false,
      docker: async () => false,
      bridge: () => false,
    };
    const r = await resolveSandboxBackendChoice(null, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(40);
  });
});
