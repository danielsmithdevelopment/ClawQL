import { describe, expect, it, afterEach, vi } from "vitest";
import { Effect } from "effect";
import {
  AGENT_REGISTRY_MISSING_PARENT_GATEWAY_WARNING,
  resetAgentRegistryParentWarningsForTests,
  warnIfAgentRegistryMissingParentGateway,
} from "./registry-startup-warnings.js";
import { registerAgentInstanceOnStart } from "./adapter-hooks.js";

describe("warnIfAgentRegistryMissingParentGateway", () => {
  afterEach(() => {
    resetAgentRegistryParentWarningsForTests();
    vi.restoreAllMocks();
  });

  it("warns when orgId is set without parentGatewayId", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await Effect.runPromise(
      warnIfAgentRegistryMissingParentGateway(
        {
          mcpEndpoint: "http://x",
          wormDbPath: "/tmp/w.db",
          inferenceEndpoint: "http://i",
          virtualKeyId: "vk",
          teeEnabled: false,
          orgId: "acme",
        },
        "hermes",
        { agentId: "h1" }
      )
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      AGENT_REGISTRY_MISSING_PARENT_GATEWAY_WARNING
    );
    expect(String(warn.mock.calls[0]?.[0])).toContain("orgId=acme");
  });

  it("does not warn when both unset (registry opt-out)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await Effect.runPromise(
      warnIfAgentRegistryMissingParentGateway(
        {
          mcpEndpoint: "http://x",
          wormDbPath: "/tmp/w.db",
          inferenceEndpoint: "http://i",
          virtualKeyId: "vk",
          teeEnabled: false,
        },
        "cline"
      )
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn when parentGatewayId is present", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await Effect.runPromise(
      warnIfAgentRegistryMissingParentGateway(
        {
          mcpEndpoint: "http://x",
          wormDbPath: "/tmp/w.db",
          inferenceEndpoint: "http://i",
          virtualKeyId: "vk",
          teeEnabled: false,
          orgId: "acme",
          parentGatewayId: "gw-east",
        },
        "pi"
      )
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("start path warns once for incomplete org enrollment", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await Effect.runPromise(
      registerAgentInstanceOnStart(
        {
          mcpEndpoint: "http://x",
          wormDbPath: "/tmp/w.db",
          inferenceEndpoint: "http://i",
          virtualKeyId: "vk",
          teeEnabled: false,
          orgId: "acme",
        },
        { agentId: "hermes-1", agentName: "hermes" }
      )
    );
    await Effect.runPromise(
      registerAgentInstanceOnStart(
        {
          mcpEndpoint: "http://x",
          wormDbPath: "/tmp/w.db",
          inferenceEndpoint: "http://i",
          virtualKeyId: "vk",
          teeEnabled: false,
          orgId: "acme",
        },
        { agentId: "hermes-1", agentName: "hermes" }
      )
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
