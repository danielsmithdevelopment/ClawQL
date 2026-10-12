import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { createMemorySecretStore } from "../stores/memory.js";
import {
  createMemoryMcpGrantKeyStore,
  createSecretStoreMcpGrantKeyStore,
  grantAsKeyEnabled,
  stampGrantVirtualKeyIdEffect,
} from "./mcp-grant-key-store.js";
import {
  createMCPOAuthServer,
  createMemoryMcpClientRegistry,
  createMemoryMcpRefreshStore,
  hashMcpClientSecret,
  McpOAuthError,
} from "./mcp-oauth.js";

describe("MCP OAuth §2 grant-as-key", () => {
  afterEach(() => {
    delete process.env.CLAWQL_MCP_OAUTH_GRANT_AS_KEY;
  });

  it("getOrCreate returns the same virtualKeyId for the same subject/client/resource", async () => {
    const store = createMemoryMcpGrantKeyStore(() => 1_000);
    const a = await Effect.runPromise(
      store.getOrCreate({
        subject: "user-1",
        clientId: "claude-desktop",
        resource: "https://mcp.example/mcp",
        scope: ["read"],
        grantType: "authorization_code",
      })
    );
    const b = await Effect.runPromise(
      store.getOrCreate({
        subject: "user-1",
        clientId: "claude-desktop",
        resource: "https://mcp.example/mcp",
        scope: ["read", "write"],
        grantType: "authorization_code",
      })
    );
    expect(a.virtualKeyId).toMatch(/^mgr_/);
    expect(a.virtualKeyId).not.toBe("claude-desktop");
    expect(b.virtualKeyId).toBe(a.virtualKeyId);
  });

  it("different subjects get different grant keys on the same client", async () => {
    const store = createMemoryMcpGrantKeyStore();
    const a = await Effect.runPromise(
      stampGrantVirtualKeyIdEffect(store, {
        subject: "alice",
        clientId: "app",
        scope: ["read"],
        grantType: "authorization_code",
      })
    );
    const b = await Effect.runPromise(
      stampGrantVirtualKeyIdEffect(store, {
        subject: "bob",
        clientId: "app",
        scope: ["read"],
        grantType: "authorization_code",
      })
    );
    expect(a).not.toBe(b);
  });

  it("revoke ends the live grant; getOrCreate mints a new id", async () => {
    const store = createMemoryMcpGrantKeyStore(() => 2_000);
    const first = await Effect.runPromise(
      store.getOrCreate({
        subject: "u",
        clientId: "c",
        scope: ["read"],
        grantType: "client_credentials",
      })
    );
    await Effect.runPromise(store.revoke(first.virtualKeyId));
    const again = await Effect.runPromise(
      store.getOrCreate({
        subject: "u",
        clientId: "c",
        scope: ["read"],
        grantType: "client_credentials",
      })
    );
    expect(again.virtualKeyId).not.toBe(first.virtualKeyId);
    const revoked = await Effect.runPromise(store.get(first.virtualKeyId));
    expect(revoked?.revokedAtMs).toBe(2_000);
  });

  it("grantAsKeyEnabled is opt-in via env or explicit store", () => {
    expect(grantAsKeyEnabled({}, false)).toBe(false);
    expect(grantAsKeyEnabled({}, true)).toBe(true);
    expect(grantAsKeyEnabled({ CLAWQL_MCP_OAUTH_GRANT_AS_KEY: "0" }, true)).toBe(false);
    expect(grantAsKeyEnabled({ CLAWQL_MCP_OAUTH_GRANT_AS_KEY: "1" }, false)).toBe(true);
  });

  it("SecretStore grant-as-key survives across store instances", async () => {
    const secrets = createMemorySecretStore();
    const storeA = createSecretStoreMcpGrantKeyStore(secrets, () => 3_000);
    const first = await Effect.runPromise(
      storeA.getOrCreate({
        subject: "user-ss",
        clientId: "claude-desktop",
        resource: "https://mcp.example/mcp",
        scope: ["read"],
        grantType: "authorization_code",
      })
    );
    const storeB = createSecretStoreMcpGrantKeyStore(secrets, () => 3_001);
    const again = await Effect.runPromise(
      storeB.getOrCreate({
        subject: "user-ss",
        clientId: "claude-desktop",
        resource: "https://mcp.example/mcp",
        scope: ["write"],
        grantType: "authorization_code",
      })
    );
    expect(again.virtualKeyId).toBe(first.virtualKeyId);
    expect(again.createdAtMs).toBe(3_000);

    await Effect.runPromise(storeB.revoke(first.virtualKeyId));
    const storeC = createSecretStoreMcpGrantKeyStore(secrets, () => 4_000);
    const afterRevoke = await Effect.runPromise(
      storeC.getOrCreate({
        subject: "user-ss",
        clientId: "claude-desktop",
        resource: "https://mcp.example/mcp",
        scope: ["read"],
        grantType: "authorization_code",
      })
    );
    expect(afterRevoke.virtualKeyId).not.toBe(first.virtualKeyId);
    const revoked = await Effect.runPromise(storeC.get(first.virtualKeyId));
    expect(revoked?.revokedAtMs).toBe(3_001);
  });

  it("client_credentials access token stamps mgr_ virtualKeyId, not clientId", async () => {
    process.env.CLAWQL_MCP_OAUTH_GRANT_AS_KEY = "1";
    const salt = "test-salt";
    const clients = createMemoryMcpClientRegistry([
      {
        clientId: "svc-bot",
        clientSecretHash: hashMcpClientSecret(salt, "secret"),
        salt,
        defaultScope: ["tools:read"],
        orgId: "org_1",
      },
    ]);
    const server = createMCPOAuthServer(
      {
        issuer: "https://mcp.example",
        signingSecret: "test-signing-secret-at-least-32-bytes!!",
        resourceAudience: "https://mcp.example/mcp",
      },
      clients,
      createMemoryMcpRefreshStore()
    );
    const token = await Effect.runPromise(
      server.issueToken({
        grantType: "client_credentials",
        clientId: "svc-bot",
        clientSecret: "secret",
        resource: "https://mcp.example/mcp",
      })
    );
    // Decode JWT payload (no verify — unit test of stamp only)
    const payload = JSON.parse(
      Buffer.from(token.access_token.split(".")[1]!, "base64url").toString("utf8")
    ) as { atr?: { virtualKeyId?: string; sub?: string }; sub?: string };
    expect(payload.atr?.virtualKeyId).toMatch(/^mgr_/);
    expect(payload.atr?.virtualKeyId).not.toBe("svc-bot");
  });

  it("revokeGrant ends validateToken and refresh for stamped tokens", async () => {
    process.env.CLAWQL_MCP_OAUTH_GRANT_AS_KEY = "1";
    const salt = "test-salt";
    const clients = createMemoryMcpClientRegistry([
      {
        clientId: "svc-bot",
        clientSecretHash: hashMcpClientSecret(salt, "secret"),
        salt,
        defaultScope: ["tools:read"],
        orgId: "org_1",
      },
    ]);
    const server = createMCPOAuthServer(
      {
        issuer: "https://mcp.example",
        signingSecret: "test-signing-secret-at-least-32-bytes!!",
        resourceAudience: "https://mcp.example/mcp",
      },
      clients,
      createMemoryMcpRefreshStore()
    );
    const token = await Effect.runPromise(
      server.issueToken({
        grantType: "client_credentials",
        clientId: "svc-bot",
        clientSecret: "secret",
        resource: "https://mcp.example/mcp",
      })
    );
    const atr = await Effect.runPromise(server.validateToken(token.access_token));
    expect(atr.virtualKeyId).toMatch(/^mgr_/);

    await Effect.runPromise(server.revokeGrant(atr.virtualKeyId!));

    const validateExit = await Effect.runPromiseExit(server.validateToken(token.access_token));
    expect(validateExit._tag).toBe("Failure");
    if (validateExit._tag === "Failure" && validateExit.cause._tag === "Fail") {
      const err = validateExit.cause.error;
      expect(err).toBeInstanceOf(McpOAuthError);
      expect((err as McpOAuthError).description).toBe("grant_revoked");
    }

    expect(token.refresh_token).toBeTruthy();
    const refreshExit = await Effect.runPromiseExit(
      server.issueToken({
        grantType: "refresh_token",
        clientId: "svc-bot",
        clientSecret: "secret",
        refreshToken: token.refresh_token!,
        resource: "https://mcp.example/mcp",
      })
    );
    expect(refreshExit._tag).toBe("Failure");
    if (refreshExit._tag === "Failure" && refreshExit.cause._tag === "Fail") {
      const err = refreshExit.cause.error;
      expect(err).toBeInstanceOf(McpOAuthError);
      expect((err as McpOAuthError).description).toBe("grant_revoked");
    }
  });
});
