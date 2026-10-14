import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  clearManagedPushDevicesEffect,
  listManagedPushDevicesEffect,
  registerManagedPushDeviceEffect,
} from "./devices-push";

describe("managed push devices", () => {
  it("registers, lists, and clears devices under CLAWQL_HOME", async () => {
    const home = mkdtempSync(join(tmpdir(), "clawql-push-"));
    const env = {
      ...process.env,
      CLAWQL_MANAGED_DATA_SOURCE: "live",
      CLAWQL_HOME: home,
    };
    const registered = await Effect.runPromise(
      registerManagedPushDeviceEffect({
        token: "ExponentPushToken[test-abc]",
        platform: "ios",
        label: "Test phone",
        userId: "user_1",
        env,
      }),
    );
    expect(registered.device.token).toContain("ExponentPushToken");
    const listed = await Effect.runPromise(listManagedPushDevicesEffect(env));
    expect(listed.devices).toHaveLength(1);
    const cleared = await Effect.runPromise(
      clearManagedPushDevicesEffect({ userId: "user_1", env }),
    );
    expect(cleared.cleared).toBe(1);
    const after = await Effect.runPromise(listManagedPushDevicesEffect(env));
    expect(after.devices).toHaveLength(0);
  });
});
