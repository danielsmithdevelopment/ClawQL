import { Effect } from "effect";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  ID_JAG_ASSERTION_TYPE,
  IdJagAuthError,
  resolveGroupToScope,
  verifyIdJagAssertionEffect,
} from "./id-jag.js";

describe("resolveGroupToScope", () => {
  it("unions scopes across matching groups and picks first role", () => {
    const result = resolveGroupToScope(
      ["Engineering", "platform"],
      [
        { idpGroup: "engineering", role: "operator", scope: ["execute", "search"] },
        { idpGroup: "platform", role: "admin", scope: ["memory", "execute"] },
      ]
    );

    expect(result.matchedGroups).toEqual(["engineering", "platform"]);
    expect(result.role).toBe("operator");
    expect(result.scope.sort()).toEqual(["execute", "memory", "search"]);
  });

  it("fails closed when no groups match and no default scope", () => {
    expect(() =>
      resolveGroupToScope(["guests"], [{ idpGroup: "engineering", scope: ["execute"] }])
    ).toThrow(IdJagAuthError);
  });
});

describe("verifyIdJagAssertionEffect", () => {
  const secret = "test-idp-hs256-secret-at-least-32-chars!!";
  const audience = "https://mcp.clawql.test/";

  it("verifies HS256 assertions and extracts groups", async () => {
    const assertion = await new SignJWT({
      groups: ["engineering"],
      org_id: "acme",
      token_type: ID_JAG_ASSERTION_TYPE,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuer("https://okta.test/")
      .setAudience(audience)
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(new TextEncoder().encode(secret));

    const verified = await Effect.runPromise(
      verifyIdJagAssertionEffect(assertion, {
        orgId: "acme",
        idpJwksUri: "https://okta.test/jwks",
        idpIssuer: "https://okta.test/",
        audience,
        hs256Secret: secret,
        groupMappings: [],
      })
    );

    expect(verified.sub).toBe("user-1");
    expect(verified.orgId).toBe("acme");
    expect(verified.groups).toEqual(["engineering"]);
  });

  it("rejects assertions with audience mismatch", async () => {
    const assertion = await new SignJWT({ groups: ["engineering"], org_id: "acme" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuer("https://okta.test/")
      .setAudience("https://wrong.test/")
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(new TextEncoder().encode(secret));

    const exit = await Effect.runPromiseExit(
      verifyIdJagAssertionEffect(assertion, {
        orgId: "acme",
        idpJwksUri: "https://okta.test/jwks",
        idpIssuer: "https://okta.test/",
        audience,
        hs256Secret: secret,
        groupMappings: [],
      })
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause).toMatchObject({
        _tag: "Fail",
        error: expect.objectContaining({ reason: "id_jag_audience_mismatch" }),
      });
    }
  });
});
