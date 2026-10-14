import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SESSION } from "../../domain/fixtures";
import {
  getMemoryByIdEffect,
  issueApiKeyEffect,
  listApiKeysEffect,
  resetFixtureStateEffect,
  revokeApiKeyEffect,
  searchMemoryEffect,
} from "../api";
import { hrefForDeepLink, parseAppDeepLinkEffect } from "../push";

describe("memory explorer + API keys", () => {
  beforeEach(async () => {
    await Effect.runPromise(resetFixtureStateEffect());
  });

  it("searches memory and loads detail fields", async () => {
    const all = await Effect.runPromise(searchMemoryEffect(FIXTURE_SESSION));
    expect(all.length).toBeGreaterThanOrEqual(3);
    const filtered = await Effect.runPromise(
      searchMemoryEffect(FIXTURE_SESSION, "northwind", "ENTITY")
    );
    expect(filtered.some((r) => r.id === "ct_4471")).toBe(true);
    const detail = await Effect.runPromise(
      getMemoryByIdEffect(FIXTURE_SESSION, "ct_4471")
    );
    expect(detail?.result.title).toMatch(/Northwind/);
    expect(detail?.fields.length).toBeGreaterThan(0);
  });

  it("issues and revokes API keys", async () => {
    const before = await Effect.runPromise(listApiKeysEffect(FIXTURE_SESSION));
    const issued = await Effect.runPromise(
      issueApiKeyEffect({ session: FIXTURE_SESSION, name: "phone-test" })
    );
    expect(issued.secret.startsWith("cqk_fixture_")).toBe(true);
    const mid = await Effect.runPromise(listApiKeysEffect(FIXTURE_SESSION));
    expect(mid.length).toBe(before.length + 1);
    await Effect.runPromise(
      revokeApiKeyEffect({ session: FIXTURE_SESSION, keyId: issued.key.id })
    );
    const after = await Effect.runPromise(listApiKeysEffect(FIXTURE_SESSION));
    expect(after.some((k) => k.id === issued.key.id)).toBe(false);
  });

  it("parses memory/keys/gateway deep links", async () => {
    const cases: Array<[string, string]> = [
      ["clawql://memory", "/memory"],
      ["clawql://memory/ct_4471", "/memory/ct_4471"],
      ["clawql://keys", "/keys"],
      ["clawql://gateway", "/gateway"],
      ["clawql://automations", "/automations"],
      ["clawql://audit", "/audit"],
      ["clawql://settings", "/settings"],
    ];
    for (const [url, href] of cases) {
      const target = await Effect.runPromise(parseAppDeepLinkEffect(url));
      expect(target).toBeTruthy();
      expect(hrefForDeepLink(target!)).toBe(href);
    }
  });
});
