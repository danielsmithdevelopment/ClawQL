import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createMemorySecretStore } from "../stores/memory.js";
import {
  CimdError,
  createCimdClientRegistry,
  createMemoryTrustedClientStore,
  createSecretStoreTrustedClientStore,
  cimdServiceLayer,
  CimdService,
  isHttpsClientIdUrl,
  parseCimdDocumentEffect,
  resolveCimdRegisteredClientEffect,
  resolveTrustedCimdClientEffect,
} from "./mcp-cimd.js";
import { createMemoryMcpClientRegistry } from "./mcp-oauth.js";
import { createSecretStoreMcpClientRegistry } from "./mcp-oauth-stores.js";

describe("MCP OAuth §3 CIMD", () => {
  const clientUrl = "https://app.example/oauth/client.json";
  const doc = {
    client_id: clientUrl,
    redirect_uris: ["https://app.example/cb"],
    client_name: "Example",
  };

  it("accepts only https client_id URLs", () => {
    expect(isHttpsClientIdUrl(clientUrl)).toBe(true);
    expect(isHttpsClientIdUrl("http://app.example/x")).toBe(false);
    expect(isHttpsClientIdUrl("svc-bot")).toBe(false);
  });

  it("parses a valid CIMD document", async () => {
    const parsed = await Effect.runPromise(parseCimdDocumentEffect(doc));
    expect(parsed.redirect_uris).toEqual(["https://app.example/cb"]);
  });

  it("fail-closed when client is not on the trusted list", async () => {
    const err = await Effect.runPromise(
      resolveTrustedCimdClientEffect(clientUrl, doc, null).pipe(Effect.flip)
    );
    expect(err).toBeInstanceOf(CimdError);
    expect(err.reason).toBe("client_not_trusted");
  });

  it("resolves when trusted and redirects are allowlisted", async () => {
    const trusted = {
      clientIdUrl: clientUrl,
      redirectUris: ["https://app.example/cb", "https://app.example/cb2"],
      trustedAtMs: 1,
    };
    const out = await Effect.runPromise(
      resolveTrustedCimdClientEffect(clientUrl, doc, trusted)
    );
    expect(out.documentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("CimdService layer rejects untrusted clients", async () => {
    const store = createMemoryTrustedClientStore([]);
    const err = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* CimdService;
        return yield* svc.resolve(clientUrl, doc);
      }).pipe(Effect.provide(cimdServiceLayer(store)), Effect.flip)
    );
    expect(err.reason).toBe("client_not_trusted");
  });

  it("fetches CIMD and registers a public client when trusted", async () => {
    const trusted = createMemoryTrustedClientStore([
      {
        clientIdUrl: clientUrl,
        redirectUris: ["https://app.example/cb"],
        trustedAtMs: 1,
      },
    ]);
    const fetchDocument = () => Effect.succeed(doc);
    const registered = await Effect.runPromise(
      resolveCimdRegisteredClientEffect(clientUrl, trusted, fetchDocument)
    );
    expect(registered.clientId).toBe(clientUrl);
    expect(registered.redirectUris).toEqual(["https://app.example/cb"]);
    expect(registered.clientSecretHash).toBeUndefined();
  });

  it("CimdClientRegistry persists resolved clients into writable registry", async () => {
    const secrets = createMemorySecretStore();
    const writable = createSecretStoreMcpClientRegistry(secrets);
    const trusted = createMemoryTrustedClientStore([
      {
        clientIdUrl: clientUrl,
        redirectUris: ["https://app.example/cb"],
        trustedAtMs: 1,
      },
    ]);
    const base = createMemoryMcpClientRegistry([]);
    const registry = createCimdClientRegistry(base, trusted, {
      writable,
      fetchDocument: () => Effect.succeed(doc),
    });
    const first = await Effect.runPromise(registry.getClient(clientUrl));
    expect(first?.clientId).toBe(clientUrl);
    const persisted = await Effect.runPromise(writable.getClient(clientUrl));
    expect(persisted?.redirectUris).toEqual(["https://app.example/cb"]);
  });

  it("SecretStore trusted-client store round-trips", async () => {
    const secrets = createMemorySecretStore();
    const store = createSecretStoreTrustedClientStore(secrets);
    await Effect.runPromise(
      store.upsert({
        clientIdUrl: clientUrl,
        redirectUris: ["https://app.example/cb"],
        trustedAtMs: 42,
      })
    );
    const got = await Effect.runPromise(store.get(clientUrl));
    expect(got?.trustedAtMs).toBe(42);
  });
});
