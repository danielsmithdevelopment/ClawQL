import { describe, expect, it, vi, afterEach } from "vitest";

import {
  loadPrivacyFilterConfig,
  maybePrivacyFilterRedactText,
  privacyFilterEnabled,
} from "./client.js";

describe("privacy-filter client", () => {
  const prevEnable = process.env.CLAWQL_ENABLE_PRIVACY_FILTER;
  const prevUrl = process.env.CLAWQL_PRIVACY_FILTER_URL;
  const prevPolicy = process.env.CLAWQL_PRIVACY_FILTER_FAILURE_POLICY;

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevEnable === undefined) delete process.env.CLAWQL_ENABLE_PRIVACY_FILTER;
    else process.env.CLAWQL_ENABLE_PRIVACY_FILTER = prevEnable;
    if (prevUrl === undefined) delete process.env.CLAWQL_PRIVACY_FILTER_URL;
    else process.env.CLAWQL_PRIVACY_FILTER_URL = prevUrl;
    if (prevPolicy === undefined) delete process.env.CLAWQL_PRIVACY_FILTER_FAILURE_POLICY;
    else process.env.CLAWQL_PRIVACY_FILTER_FAILURE_POLICY = prevPolicy;
  });

  it("disabled by default", () => {
    delete process.env.CLAWQL_ENABLE_PRIVACY_FILTER;
    expect(privacyFilterEnabled()).toBe(false);
    expect(loadPrivacyFilterConfig()).toBeNull();
  });

  it("passes through when disabled", async () => {
    delete process.env.CLAWQL_ENABLE_PRIVACY_FILTER;
    const out = await maybePrivacyFilterRedactText("hello");
    expect(out).toBe("hello");
  });

  it("redacts via local HTTP sidecar", async () => {
    process.env.CLAWQL_ENABLE_PRIVACY_FILTER = "1";
    process.env.CLAWQL_PRIVACY_FILTER_URL = "http://privacy-filter";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            text: "My name is [PRIVATE_PERSON]",
            spans: [{ entity_group: "private_person", start: 11, end: 21, score: 0.99 }],
            mode: "demo",
            local: true,
          }),
          { status: 200 }
        );
      })
    );

    const out = await maybePrivacyFilterRedactText("My name is Alice Smith");
    expect(out).toBe("My name is [PRIVATE_PERSON]");
  });

  it("warns and passes through on failure by default", async () => {
    process.env.CLAWQL_ENABLE_PRIVACY_FILTER = "1";
    process.env.CLAWQL_PRIVACY_FILTER_URL = "http://privacy-filter";
    delete process.env.CLAWQL_PRIVACY_FILTER_FAILURE_POLICY;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 }))
    );

    const out = await maybePrivacyFilterRedactText("secret data");
    expect(out).toBe("secret data");
  });
});
