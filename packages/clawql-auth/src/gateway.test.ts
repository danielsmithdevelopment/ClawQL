import { afterEach, describe, expect, it } from "vitest";

import {
  defaultAdminAtrClaims,
  loadGatewayAuthConfig,
  resolveAtrClaimsFromHeaders,
  resolveAuthMode,
} from "./gateway.js";

describe("clawql-auth gateway", () => {
  const prevMode = process.env.CLAWQL_AUTH_MODE;
  const prevKey = process.env.CLAWQL_API_KEY;

  afterEach(() => {
    if (prevMode === undefined) delete process.env.CLAWQL_AUTH_MODE;
    else process.env.CLAWQL_AUTH_MODE = prevMode;
    if (prevKey === undefined) delete process.env.CLAWQL_API_KEY;
    else process.env.CLAWQL_API_KEY = prevKey;
  });

  it("defaults to noAuth with admin claims", () => {
    delete process.env.CLAWQL_AUTH_MODE;
    expect(resolveAuthMode()).toBe("noAuth");
    const r = resolveAtrClaimsFromHeaders({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims.role).toBe("admin");
      expect(r.claims.scope).toContain("*");
    }
  });

  it("apiKey mode rejects missing key", () => {
    process.env.CLAWQL_AUTH_MODE = "apiKey";
    process.env.CLAWQL_API_KEY = "secret";
    const bad = resolveAtrClaimsFromHeaders({}, loadGatewayAuthConfig());
    expect(bad.ok).toBe(false);

    const good = resolveAtrClaimsFromHeaders(
      { authorization: "Bearer secret" },
      loadGatewayAuthConfig()
    );
    expect(good.ok).toBe(true);
  });

  it("defaultAdminAtrClaims is stable shape", () => {
    expect(defaultAdminAtrClaims("u1")).toEqual({
      sub: "u1",
      role: "admin",
      scope: ["*"],
    });
  });
});
