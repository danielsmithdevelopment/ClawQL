import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { isOrgSpoofAttempt, OrgScopeError, resolveTrustedOrgIdEffect } from "./org-scope";

describe("managed org scope (IDOR)", () => {
  it("uses session org when env unset", async () => {
    const orgId = await Effect.runPromise(
      resolveTrustedOrgIdEffect({
        sessionOrgId: "org_acme",
        env: {},
      })
    );
    expect(orgId).toBe("org_acme");
  });

  it("prefers CLAWQL_MANAGED_ORG_ID over session", async () => {
    const orgId = await Effect.runPromise(
      resolveTrustedOrgIdEffect({
        sessionOrgId: "org_acme",
        env: { CLAWQL_MANAGED_ORG_ID: "org_prod" },
      })
    );
    expect(orgId).toBe("org_prod");
  });

  it("rejects client orgId that differs from trusted (spoof)", async () => {
    const result = await Effect.runPromise(
      resolveTrustedOrgIdEffect({
        sessionOrgId: "org_acme",
        clientOrgId: "org_victim",
        env: {},
      }).pipe(Effect.flip)
    );
    expect(result).toBeInstanceOf(OrgScopeError);
    expect(result.reason).toBe("org_spoof");
  });

  it("allows matching client orgId", async () => {
    const orgId = await Effect.runPromise(
      resolveTrustedOrgIdEffect({
        sessionOrgId: "org_acme",
        clientOrgId: "org_acme",
        env: {},
      })
    );
    expect(orgId).toBe("org_acme");
  });

  it("isOrgSpoofAttempt detects mismatch only", () => {
    expect(isOrgSpoofAttempt({ trustedOrgId: "org_a", clientOrgId: "org_b" })).toBe(true);
    expect(isOrgSpoofAttempt({ trustedOrgId: "org_a", clientOrgId: "org_a" })).toBe(false);
    expect(isOrgSpoofAttempt({ trustedOrgId: "org_a", clientOrgId: null })).toBe(false);
    expect(isOrgSpoofAttempt({ trustedOrgId: "org_a" })).toBe(false);
  });
});
