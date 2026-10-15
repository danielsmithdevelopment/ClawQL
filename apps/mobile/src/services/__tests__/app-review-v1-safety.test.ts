import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { REVIEWER_DEMO_SESSION, FIXTURE_SESSION } from "../../domain/fixtures";
import type { MobileSession } from "../../domain/schemas";
import {
  getGatewayBundleEffect,
  listAutomationsEffect,
  searchMemoryEffect,
} from "../api";
import {
  clearOfflineSnapshotEffect,
  loadOfflineSnapshotEffect,
  saveOfflineSnapshotEffect,
} from "../offline-cache";
import {
  allowsDemoData,
  allowsInAppCommerce,
  isFixtureBuild,
  V1_READ_ONLY_SURFACES,
} from "../release-policy";
import { copySecretEffect, isSecureClipboardBridgeAvailable } from "../secure-clipboard";
import type { MobileConfig } from "../config";

const fixtureConfig = {
  fixtureMode: true,
  apiBase: "https://cloud.clawql.com",
  authIssuer: "https://cloud.clawql.com",
  reviewerBiometricDemo: false,
} as MobileConfig;

const productionConfig = {
  ...fixtureConfig,
  fixtureMode: false,
} as MobileConfig;

const liveSession: MobileSession = {
  ...FIXTURE_SESSION,
  accessToken: "live-access-token",
  refreshToken: "live-refresh-token",
  reviewerDemo: false,
};

describe("release policy", () => {
  it("sells nothing in production builds", () => {
    expect(allowsInAppCommerce(productionConfig)).toBe(false);
    expect(allowsInAppCommerce(fixtureConfig)).toBe(true);
    expect(isFixtureBuild(fixtureConfig)).toBe(true);
  });

  it("allows demo data only for fixture / reviewer demo", () => {
    expect(allowsDemoData(liveSession, productionConfig)).toBe(false);
    expect(allowsDemoData(FIXTURE_SESSION, productionConfig)).toBe(true);
    expect(allowsDemoData(REVIEWER_DEMO_SESSION, productionConfig)).toBe(true);
    expect(allowsDemoData(liveSession, fixtureConfig)).toBe(true);
  });

  it("marks gateway / automations / settings read-only in v1", () => {
    expect(V1_READ_ONLY_SURFACES).toEqual(["gateway", "automations", "settings"]);
  });
});

describe("production empty states (no silent fixtures)", () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_CLAWQL_FIXTURE = "1";
  });

  it("memory search returns empty on live failure without demo", async () => {
    process.env.EXPO_PUBLIC_CLAWQL_FIXTURE = "0";
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const rows = await Effect.runPromise(searchMemoryEffect(liveSession, "northwind"));
    expect(rows).toEqual([]);
    spy.mockRestore();
  });

  it("gateway / automations return empty catalogs for live sessions", async () => {
    process.env.EXPO_PUBLIC_CLAWQL_FIXTURE = "0";
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const gateway = await Effect.runPromise(getGatewayBundleEffect(liveSession));
    const automations = await Effect.runPromise(listAutomationsEffect(liveSession));
    expect(gateway.endpoints).toEqual([]);
    expect(gateway.routes).toEqual([]);
    expect(gateway.source).toBe("live");
    expect(automations).toEqual([]);
    spy.mockRestore();
  });
});

describe("encrypted offline cache (no-backup path)", () => {
  afterEach(async () => {
    await Effect.runPromise(clearOfflineSnapshotEffect()).catch(() => undefined);
  });

  it("round-trips encrypted snapshot and clears on demand", async () => {
    await Effect.runPromise(
      saveOfflineSnapshotEffect({
        reviewItems: [],
        activityEvents: [],
        inbox: [],
      })
    );
    const loaded = await Effect.runPromise(loadOfflineSnapshotEffect());
    expect(loaded).not.toBeNull();
    expect(loaded?.reviewItems).toEqual([]);
    await Effect.runPromise(clearOfflineSnapshotEffect());
    expect(await Effect.runPromise(loadOfflineSnapshotEffect())).toBeNull();
  });
});

describe("secure clipboard", () => {
  afterEach(() => {
    delete globalThis.__CLAWQL_SECURE_CLIPBOARD__;
  });

  it("does not auto-copy without a local-only bridge", async () => {
    expect(isSecureClipboardBridgeAvailable()).toBe(false);
    const out = await Effect.runPromise(copySecretEffect("cqk_secret_test", { ttlMs: 50 }));
    expect(out.copied).toBe(false);
    expect(out.localOnly).toBe(false);
    expect(out.manualOnly).toBe(true);
  });

  it("uses native localOnly bridge when installed", async () => {
    globalThis.__CLAWQL_SECURE_CLIPBOARD__ = {
      setSecret: async () => true,
    };
    expect(isSecureClipboardBridgeAvailable()).toBe(true);
    const out = await Effect.runPromise(copySecretEffect("cqk_secret_native", { ttlMs: 30_000 }));
    expect(out.copied).toBe(true);
    expect(out.localOnly).toBe(true);
    expect(out.manualOnly).toBe(false);
    expect(out.clearedAfterMs).toBe(30_000);
  });
});
