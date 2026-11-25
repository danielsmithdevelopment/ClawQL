import { describe, expect, it } from "vitest";
import { assertInferenceBindAuthPolicy, resolveInferenceHost } from "./server.js";

describe("inference bind auth (audit 6.03)", () => {
  it("defaults host to loopback", () => {
    expect(resolveInferenceHost({})).toBe("127.0.0.1");
  });

  it("allows unauthenticated loopback", () => {
    expect(() => assertInferenceBindAuthPolicy("127.0.0.1", {})).not.toThrow();
  });

  it("refuses unauthenticated non-loopback without allow flag", () => {
    expect(() => assertInferenceBindAuthPolicy("0.0.0.0", {})).toThrow(/unauthenticated/);
  });

  it("allows non-loopback with explicit allow flag", () => {
    expect(() =>
      assertInferenceBindAuthPolicy("0.0.0.0", {
        CLAWQL_INFERENCE_ALLOW_UNAUTHENTICATED: "1",
      })
    ).not.toThrow();
  });

  it("regulated refuses unauthenticated even with allow flag", () => {
    expect(() =>
      assertInferenceBindAuthPolicy("0.0.0.0", {
        CLAWQL_TIER: "regulated",
        CLAWQL_INFERENCE_ALLOW_UNAUTHENTICATED: "1",
      })
    ).toThrow(/regulated/);
  });

  it("regulated with keys enabled allows non-loopback", () => {
    expect(() =>
      assertInferenceBindAuthPolicy("0.0.0.0", {
        CLAWQL_TIER: "regulated",
        CLAWQL_INFERENCE_KEYS_ENABLED: "1",
      })
    ).not.toThrow();
  });
});
