import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createMemorySecretStore } from "../stores/memory.js";
import {
  createDeviceAuthorizationEffect,
  createMemoryDeviceCodeStore,
  createSecretStoreDeviceCodeStore,
  DeviceFlowError,
  deviceFlowServiceLayer,
  DeviceFlowService,
} from "./mcp-device-flow.js";

describe("MCP OAuth §4 device flow", () => {
  it("issues device_code + user_code and completes after approve", async () => {
    let t = 1_000;
    const store = createMemoryDeviceCodeStore(() => t);
    const issued = await Effect.runPromise(
      createDeviceAuthorizationEffect(
        store,
        { verificationUri: "https://mcp.example/device", now: () => t },
        "cli-client"
      )
    );
    expect(issued.device_code).toMatch(/^dvc_/);
    expect(issued.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const pending = await Effect.runPromise(
      store.consumeApproved(issued.device_code).pipe(Effect.flip)
    );
    expect(pending).toBeInstanceOf(DeviceFlowError);
    expect(pending.error).toBe("authorization_pending");

    await Effect.runPromise(store.approve(issued.user_code, "user-42"));
    const approved = await Effect.runPromise(store.consumeApproved(issued.device_code));
    expect(approved.approvedSubject).toBe("user-42");
  });

  it("expires device codes", async () => {
    let t = 1_000;
    const store = createMemoryDeviceCodeStore(() => t);
    const issued = await Effect.runPromise(
      createDeviceAuthorizationEffect(
        store,
        {
          verificationUri: "https://mcp.example/device",
          expiresInSec: 10,
          now: () => t,
        },
        "cli"
      )
    );
    t = 20_000;
    const err = await Effect.runPromise(
      store.consumeApproved(issued.device_code).pipe(Effect.flip)
    );
    expect(err.error).toBe("expired_token");
  });

  it("DeviceFlowService layer authorize + approve + poll", async () => {
    const store = createMemoryDeviceCodeStore();
    const layer = deviceFlowServiceLayer(store, {
      verificationUri: "https://mcp.example/device",
    });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* DeviceFlowService;
        const auth = yield* svc.authorize("cli");
        yield* svc.approve(auth.user_code, "alice");
        const done = yield* svc.poll(auth.device_code);
        return done.approvedSubject;
      }).pipe(Effect.provide(layer))
    );
    expect(result).toBe("alice");
  });

  it("SecretStore device-code store survives across store instances", async () => {
    const secrets = createMemorySecretStore();
    let t = 1_000;
    const storeA = createSecretStoreDeviceCodeStore(secrets, () => t);
    const issued = await Effect.runPromise(
      createDeviceAuthorizationEffect(
        storeA,
        { verificationUri: "https://mcp.example/device", now: () => t },
        "cli"
      )
    );
    await Effect.runPromise(storeA.approve(issued.user_code, "bob"));

    const storeB = createSecretStoreDeviceCodeStore(secrets, () => t);
    const done = await Effect.runPromise(storeB.consumeApproved(issued.device_code));
    expect(done.approvedSubject).toBe("bob");
  });
});
