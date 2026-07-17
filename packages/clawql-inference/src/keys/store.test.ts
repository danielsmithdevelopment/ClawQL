import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRateLimit, checkRateLimit, resetRateLimitState } from "./rate-limit.js";

describe("rate limit", () => {
  it("parses rpm and rps", () => {
    expect(parseRateLimit("100rpm")).toEqual({ maxRequests: 100, windowMs: 60_000 });
    expect(parseRateLimit("10rps")).toEqual({ maxRequests: 10, windowMs: 1_000 });
    expect(parseRateLimit("")).toBeUndefined();
    expect(parseRateLimit("0rpm")).toBeUndefined();
    expect(parseRateLimit("garbage")).toBeUndefined();
    expect(parseRateLimit("999999999999999999999rpm")).toEqual({
      maxRequests: Number.parseInt("999999999999999999999", 10),
      windowMs: 60_000,
    });
  });

  it("enforces sliding window and isolates keyIds", () => {
    resetRateLimitState();
    const spec = { maxRequests: 2, windowMs: 1_000 };
    expect(checkRateLimit("k1", spec, 1_000)).toBe(true);
    expect(checkRateLimit("k1", spec, 1_100)).toBe(true);
    expect(checkRateLimit("k1", spec, 1_200)).toBe(false);
    expect(checkRateLimit("k1", spec, 2_100)).toBe(true);
    expect(checkRateLimit("k2", spec, 1_200)).toBe(true);
  });
});

describe("virtual key store", () => {
  it("creates, lists, and revokes keys", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-keys-"));
    const env = { CLAWQL_HOME: dir, CLAWQL_INFERENCE_KEYS_ENABLED: "1" };
    const {
      createVirtualKey,
      listVirtualKeys,
      revokeVirtualKey,
      findKeyBySecret,
      loadVirtualKeyStoreSync,
    } = await import("./store.js");

    const created = await createVirtualKey(
      { team: "eng", budgetUsd: 50, rateLimit: "100rpm" },
      env
    );
    expect(created.key.id).toMatch(/^vk_/);
    expect(created.secret).toMatch(/^clawql-vk-/);

    const store = loadVirtualKeyStoreSync(env);
    const found = findKeyBySecret(store, created.secret);
    expect(found?.team).toBe("eng");

    expect(listVirtualKeys(env)).toHaveLength(1);

    const revoked = await revokeVirtualKey(created.key.id, env);
    expect(revoked?.key.revokedAt).toBeTruthy();
    const reloaded = loadVirtualKeyStoreSync(env);
    expect(findKeyBySecret(reloaded, created.secret)).toBeUndefined();
  });
});
