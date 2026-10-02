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

  it("defaults unset in-cluster to auto (Agent Substrate → Kata …)", () => {
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

  it("accepts agent-substrate aliases", () => {
    process.env.CLAWQL_SANDBOX_BACKEND = "substrate";
    expect(parseExplicitSandboxBackendEnv()).toBe("agent-substrate");
    process.env.CLAWQL_SANDBOX_BACKEND = "gvisor";
    expect(parseExplicitSandboxBackendEnv()).toBe("agent-substrate");
  });
});

describe("resolveSandboxBackendChoice", () => {
  const depsAllTrue: SandboxBackendAutoDeps = {
    agentSubstrate: () => true,
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

  it("explicit agent-substrate pins Agent Substrate", async () => {
    const r = await resolveSandboxBackendChoice("agent-substrate", depsAllTrue);
    expect(r).toEqual({ ok: true, backend: "agent-substrate" });
  });

  it("auto prefers Agent Substrate when available (ADR 0011)", async () => {
    const r = await resolveSandboxBackendChoice(null, depsAllTrue);
    expect(r).toEqual({ ok: true, backend: "agent-substrate" });
  });

  it("auto prefers kata when Agent Substrate unavailable", async () => {
    const deps: SandboxBackendAutoDeps = {
      agentSubstrate: () => false,
      kata: async () => true,
      seatbelt: () => true,
      docker: async () => true,
      bridge: () => true,
    };
    const r = await resolveSandboxBackendChoice(null, deps);
    expect(r).toEqual({ ok: true, backend: "kata" });
  });

  it("auto uses docker when kata and substrate unavailable", async () => {
    const deps: SandboxBackendAutoDeps = {
      agentSubstrate: () => false,
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
      agentSubstrate: () => false,
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
      agentSubstrate: () => false,
      kata: async () => false,
      seatbelt: () => false,
      docker: async () => false,
      bridge: () => false,
    };
    const r = await resolveSandboxBackendChoice(null, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Agent Substrate/);
  });
});
