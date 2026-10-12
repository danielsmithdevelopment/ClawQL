import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  parsePlainProxyKeyGroups,
  plainProxyEnabled,
  plainProxyEnabledEffect,
  PlainProxyLive,
  PlainProxyService,
} from "./plain-proxy.js";

describe("plain proxy enablement", () => {
  it("parses comma-separated key groups (trim, case-fold)", () => {
    expect([...parsePlainProxyKeyGroups(" Engineering ,ops, ")].sort()).toEqual([
      "engineering",
      "ops",
    ]);
    expect(parsePlainProxyKeyGroups(undefined).size).toBe(0);
  });

  it("defaults off", () => {
    expect(plainProxyEnabled({})).toBe(false);
  });

  it("enables with CLAWQL_ENABLE_PLAIN_PROXY=1", () => {
    expect(plainProxyEnabled({ CLAWQL_ENABLE_PLAIN_PROXY: "1" })).toBe(true);
    expect(plainProxyEnabled({ CLAWQL_ENABLE_PLAIN_PROXY: "true" })).toBe(true);
  });

  it("enables when key group is in allowlist", () => {
    expect(
      plainProxyEnabled({
        CLAWQL_PLAIN_PROXY_KEY_GROUPS: "engineering,ops",
        CLAWQL_API_KEY_GROUP: "Engineering",
      })
    ).toBe(true);
  });

  it("stays off when group missing or not allowlisted", () => {
    expect(
      plainProxyEnabled({
        CLAWQL_PLAIN_PROXY_KEY_GROUPS: "engineering",
      })
    ).toBe(false);
    expect(
      plainProxyEnabled({
        CLAWQL_PLAIN_PROXY_KEY_GROUPS: "engineering",
        CLAWQL_API_KEY_GROUP: "support",
      })
    ).toBe(false);
  });

  it("Effect service Layer agrees with sync façade", async () => {
    const env = {
      CLAWQL_PLAIN_PROXY_KEY_GROUPS: "legal",
      CLAWQL_API_KEY_GROUP: "legal",
    } as NodeJS.ProcessEnv;
    const viaService = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* PlainProxyService;
        return yield* svc.enabled(env);
      }).pipe(Effect.provide(PlainProxyLive))
    );
    expect(viaService).toBe(true);
    expect(Effect.runSync(plainProxyEnabledEffect(env))).toBe(true);
  });
});
