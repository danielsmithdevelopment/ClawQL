import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";

import { connectViaTailcat, startTailcatListener } from "./tailcat-adapter.js";

describe("tailcat adapter (dev shim)", () => {
  const handles: Array<{ stop: () => Effect.Effect<void, unknown> }> = [];

  afterEach(async () => {
    for (const handle of handles.splice(0)) {
      await Effect.runPromise(handle.stop().pipe(Effect.catchAll(() => Effect.void)));
    }
  });

  it("starts a listener and returns a tc+ address", async () => {
    const listener = await Effect.runPromise(startTailcatListener());
    handles.push(listener);
    expect(listener.address.startsWith("tc+")).toBe(true);
    expect(listener.localPublicKey.length).toBeGreaterThan(10);
  });

  it("connects to a listener address", async () => {
    const listener = await Effect.runPromise(startTailcatListener());
    handles.push(listener);
    const connection = await Effect.runPromise(connectViaTailcat(listener.address));
    handles.push(connection);
    expect(connection.remotePublicKey.length).toBeGreaterThan(10);
    expect(connection.localPublicKey.length).toBeGreaterThan(10);
  });
});
