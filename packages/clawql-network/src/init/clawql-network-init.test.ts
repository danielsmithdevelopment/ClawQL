import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { Effect } from "effect";

import { initNetworking } from "./clawql-network-init.js";
import { loadNetworkState } from "../network-state.js";

describe("initNetworking", () => {
  it("writes network state with safe defaults", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-network-init-"));
    try {
      const result = await Effect.runPromise(
        initNetworking({ home, controlPlaneHost: "localhost", nodeId: "test-node" })
      );
      expect(result.transportDefault).toBe("headscale-mesh");
      expect(result.tailcatScopeRequired).toBe("network:tailcat_ephemeral");
      expect(result.meshIdentity?.nodeId).toBeTruthy();

      const state = await Effect.runPromise(loadNetworkState(home));
      expect(state?.transportDefault).toBe("headscale-mesh");
      expect(state?.meshIdentity?.meshAddress).toContain("clawql");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
