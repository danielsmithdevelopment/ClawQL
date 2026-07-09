import { describe, expect, it } from "vitest";

import { assertSafeSourceFetchUrl, assertSafeSourceId } from "./custom-sources-security.js";
import { slugifySourceId } from "./custom-sources-types.js";

describe("custom-sources-security", () => {
  it("assertSafeSourceId rejects traversal", () => {
    expect(() => assertSafeSourceId("../etc")).toThrow();
    expect(() => assertSafeSourceId("a/b")).toThrow();
    expect(assertSafeSourceId("my-api")).toBe("my-api");
  });

  it("slugifySourceId returns safe ids", () => {
    expect(slugifySourceId("My API v2")).toBe("my-api-v2");
    expect(slugifySourceId("!!!")).toBe("source");
  });

  it("assertSafeSourceFetchUrl blocks private hosts", () => {
    expect(() => assertSafeSourceFetchUrl("http://127.0.0.1/spec.json")).toThrow();
    expect(() => assertSafeSourceFetchUrl("https://localhost/openapi.json")).toThrow();
    const u = assertSafeSourceFetchUrl("https://example.com/openapi.json");
    expect(u.hostname).toBe("example.com");
  });
});
