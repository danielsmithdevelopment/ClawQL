import { describe, expect, it } from "vitest";
import { grpcAuthContextFromAuthorizeResult } from "./server.js";

describe("grpcAuthContextFromAuthorizeResult (T2)", () => {
  it("maps explicit scopes", () => {
    expect(
      grpcAuthContextFromAuthorizeResult({ ok: true, sub: "u", scope: ["search", "memory"] })
        .atrScopeTokens
    ).toEqual(["search", "memory"]);
  });

  it("maps star scope", () => {
    expect(
      grpcAuthContextFromAuthorizeResult({ ok: true, sub: "u", scope: ["*"] }).atrScopeTokens
    ).toEqual(["*"]);
  });

  it("denies empty scope list", () => {
    expect(
      grpcAuthContextFromAuthorizeResult({ ok: true, sub: "u", scope: [] }).atrScopeTokens
    ).toEqual([]);
  });

  it("denies authenticated principal with missing scope (HTTP parity)", () => {
    expect(grpcAuthContextFromAuthorizeResult({ ok: true, sub: "u" }).atrScopeTokens).toEqual([]);
    expect(grpcAuthContextFromAuthorizeResult({ ok: true, tenantId: "t1" }).atrScopeTokens).toEqual(
      []
    );
  });

  it("leaves boolean-true auth unscoped for tests", () => {
    expect(grpcAuthContextFromAuthorizeResult({ ok: true }).atrScopeTokens).toBeUndefined();
  });
});
