import { describe, expect, it } from "vitest";
import { Effect } from "effect";

import {
  buildMcpProtectedResourceMetadataEffect,
  buildMcpWwwAuthenticateHeaderEffect,
  resolveMcpResourceIdentifierEffect,
  resolvePublicOriginEffect,
  resolveTokenAudienceEffect,
  resourcesMatch,
} from "./protected-resource.js";

describe("protected-resource discovery helpers", () => {
  it("builds RFC 9728 metadata with canonical resource + AS list", async () => {
    const doc = await Effect.runPromise(
      buildMcpProtectedResourceMetadataEffect({
        resource: "https://acme.cloud.clawql.com/mcp/",
        authorizationServers: ["https://acme.cloud.clawql.com"],
        scopesSupported: ["execute", "search"],
        resourceName: "ClawQL MCP",
      })
    );
    expect(doc.resource).toBe("https://acme.cloud.clawql.com/mcp");
    expect(doc.authorization_servers).toEqual(["https://acme.cloud.clawql.com"]);
    expect(doc.scopes_supported).toEqual(["execute", "search"]);
    expect(doc.bearer_methods_supported).toEqual(["header"]);
    expect(doc.resource_name).toBe("ClawQL MCP");
  });

  it("builds WWW-Authenticate with resource_metadata", async () => {
    const header = await Effect.runPromise(
      buildMcpWwwAuthenticateHeaderEffect({
        resourceMetadataUrl:
          "https://acme.cloud.clawql.com/.well-known/oauth-protected-resource",
        error: "invalid_token",
        errorDescription: "missing_bearer",
      })
    );
    expect(header).toContain(
      'Bearer resource_metadata="https://acme.cloud.clawql.com/.well-known/oauth-protected-resource"'
    );
    expect(header).toContain('error="invalid_token"');
    expect(header).toContain('error_description="missing_bearer"');
  });

  it("resolves public origin and MCP resource id", async () => {
    const origin = await Effect.runPromise(
      resolvePublicOriginEffect({ proto: "https", host: "acme.cloud.clawql.com" })
    );
    expect(origin).toBe("https://acme.cloud.clawql.com");
    const derived = await Effect.runPromise(
      resolveMcpResourceIdentifierEffect({ origin, mcpPath: "/mcp" })
    );
    expect(derived).toBe("https://acme.cloud.clawql.com/mcp");
    const configured = await Effect.runPromise(
      resolveMcpResourceIdentifierEffect({
        origin,
        configuredResource: "https://acme.cloud.clawql.com/mcp/",
      })
    );
    expect(configured).toBe("https://acme.cloud.clawql.com/mcp");
  });

  it("enforces RFC 8707 resource match for token audience", async () => {
    const ok = await Effect.runPromise(
      resolveTokenAudienceEffect(
        "https://acme.cloud.clawql.com/mcp/",
        "https://acme.cloud.clawql.com/mcp"
      )
    );
    expect(ok).toBe("https://acme.cloud.clawql.com/mcp");

    const mismatch = await Effect.runPromise(
      Effect.result(
        resolveTokenAudienceEffect(
          "https://other.example/mcp",
          "https://acme.cloud.clawql.com/mcp"
        )
      )
    );
    expect(mismatch._tag).toBe("Failure");
    expect(resourcesMatch("https://a/mcp/", "https://a/mcp")).toBe(true);
    expect(resourcesMatch("https://a/mcp", "https://b/mcp")).toBe(false);
  });
});
