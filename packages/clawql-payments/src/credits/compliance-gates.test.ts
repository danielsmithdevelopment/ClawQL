import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertCreditsP2pEnabled,
  isCreditsOrgTransferEnabled,
  isCreditsP2pEnabled,
  isManagedHosting,
} from "./config.js";
import { assertCompensationEnabled, isCompensationEnabled } from "../compensation/config.js";

describe("payments compliance gates", () => {
  afterEach(() => {
    delete process.env.CLAWQL_CREDITS_P2P_ENABLED;
    delete process.env.CLAWQL_COMPENSATION_ENABLED;
    delete process.env.CLAWQL_MANAGED_HOSTING;
    delete process.env.CLAWQL_HOSTED_MODE;
    delete process.env.CLAWQL_GATEWAY_MANAGED;
  });

  it("defaults P2P and compensation off", () => {
    expect(Effect.runSync(isCreditsP2pEnabled({}))).toBe(false);
    expect(isCompensationEnabled({})).toBe(false);
    expect(Effect.runSync(isManagedHosting({}))).toBe(false);
  });

  it("allows P2P when explicitly enabled on self-hosted", () => {
    expect(Effect.runSync(isCreditsP2pEnabled({ CLAWQL_CREDITS_P2P_ENABLED: "1" }))).toBe(true);
    expect(() => assertCreditsP2pEnabled({ CLAWQL_CREDITS_P2P_ENABLED: "1" })).not.toThrow();
  });

  it("blocks P2P on managed hosting even if flag is set", () => {
    const env = { CLAWQL_MANAGED_HOSTING: "1", CLAWQL_CREDITS_P2P_ENABLED: "1" };
    expect(Effect.runSync(isCreditsP2pEnabled(env))).toBe(false);
    expect(() => assertCreditsP2pEnabled(env)).toThrow(/managed hosting/i);
  });

  it("allows org transfers by default when credits are on (including managed)", () => {
    expect(
      Effect.runSync(
        isCreditsOrgTransferEnabled({
          CLAWQL_CREDITS_ENABLED: "1",
          CLAWQL_MANAGED_HOSTING: "1",
        })
      )
    ).toBe(true);
  });

  it("allows compensation when explicitly enabled on self-hosted", () => {
    expect(isCompensationEnabled({ CLAWQL_COMPENSATION_ENABLED: "1" })).toBe(true);
    expect(() => assertCompensationEnabled({ CLAWQL_COMPENSATION_ENABLED: "1" })).not.toThrow();
  });

  it("blocks compensation on managed hosting even if flag is set", () => {
    const env = { CLAWQL_HOSTED_MODE: "1", CLAWQL_COMPENSATION_ENABLED: "1" };
    expect(isCompensationEnabled(env)).toBe(false);
    expect(() => assertCompensationEnabled(env)).toThrow(/managed hosting/i);
  });
});
