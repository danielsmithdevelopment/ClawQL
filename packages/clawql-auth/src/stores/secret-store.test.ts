import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { createClawQLAuth } from "../create-auth.js";
import { createEnvSecretStore } from "./env.js";
import { createHashiCorpVaultStore, type VaultHttpClient } from "./hashicorp-vault.js";
import { createMemorySecretStore } from "./memory.js";
import { createOpenBaoStore } from "./openbao.js";
import { resolveSecretStore, resolveSecretStoreKind } from "./resolve.js";
import { createSQLiteSecretStore } from "./sqlite.js";
import type { SecretStore } from "./types.js";

describe("SecretStore", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  async function expectLifecycle(store: SecretStore) {
    await Effect.runPromise(store.setSecret("providers/slack/token", "xoxb-test"));
    expect(await Effect.runPromise(store.getSecret("providers/slack/token"))).toBe("xoxb-test");
    expect(await Effect.runPromise(store.listSecrets("providers/"))).toContain(
      "providers/slack/token"
    );

    await Effect.runPromise(
      store.setOAuthToken("google", {
        accessToken: "at",
        refreshToken: "rt",
        expiresAtMs: Date.now() + 60_000,
      })
    );
    const tok = await Effect.runPromise(store.getOAuthToken("google"));
    expect(tok?.accessToken).toBe("at");
    expect(tok?.status).toBe("active");
    await Effect.runPromise(store.markRequiresReauth("google"));
    expect((await Effect.runPromise(store.getOAuthToken("google")))?.status).toBe("needs_reauth");

    await Effect.runPromise(
      store.saveAPIKeyRecord({
        id: "cqk_abc",
        secretHash: "hh",
        salt: "ss",
        subjectId: "alice",
        role: "operator",
        scope: ["execute"],
        createdAt: new Date().toISOString(),
      })
    );
    expect((await Effect.runPromise(store.getAPIKeyRecord("cqk_abc")))?.id).toBe("cqk_abc");
    await Effect.runPromise(store.setRevokedAt("cqk_abc", new Date("2026-08-21T00:00:00.000Z")));
    expect((await Effect.runPromise(store.getAPIKeyRecord("cqk_abc")))?.revokedAt).toBe(
      "2026-08-21T00:00:00.000Z"
    );

    await Effect.runPromise(
      store.storeNonce("n1", {
        nonce: "n1",
        purpose: "oauth",
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + 60_000,
      })
    );
    await Effect.runPromise(store.markNonceConsumed("n1"));
    expect((await Effect.runPromise(store.getNonce("n1")))?.consumedAtMs).toBeTypeOf("number");

    await Effect.runPromise(
      store.storeDomainChallenge("example.com", {
        domain: "example.com",
        challenge: "chal",
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + 60_000,
      })
    );
    expect(await Effect.runPromise(store.getDomainChallenge("example.com"))).toMatchObject({
      challenge: "chal",
    });
    await Effect.runPromise(store.deleteDomainChallenge("example.com"));
    expect(await Effect.runPromise(store.getDomainChallenge("example.com"))).toBeNull();

    await Effect.runPromise(store.deleteSecret("providers/slack/token"));
    expect(await Effect.runPromise(store.getSecret("providers/slack/token"))).toBeNull();
  }

  it("memory store covers SecretStore lifecycle", async () => {
    await expectLifecycle(createMemorySecretStore());
  });

  it("sqlite store is the local/homelab default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clawql-secret-"));
    tmpDirs.push(dir);
    const store = createSQLiteSecretStore({ path: join(dir, "secrets.db") });
    await expectLifecycle(store);
    await Effect.runPromise(store.close());
  });

  it("env store reads CLAWQL_SECRET_* and supports overlay writes when enabled", async () => {
    process.env.CLAWQL_SECRET_FOO_BAR = "from-env";
    const store = createEnvSecretStore({ allowOverlayWrites: true });
    expect(await Effect.runPromise(store.getSecret("foo/bar"))).toBe("from-env");
    await Effect.runPromise(store.setSecret("local/only", "overlay"));
    expect(await Effect.runPromise(store.getSecret("local/only"))).toBe("overlay");
    delete process.env.CLAWQL_SECRET_FOO_BAR;
  });

  it("env store rejects writes as a typed SecretStoreError when overlay disabled", async () => {
    const store = createEnvSecretStore({ allowOverlayWrites: false });
    const result = await Effect.runPromise(
      Effect.either(store.setSecret("local/only", "overlay"))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.reason).toBe("env_secret_store_readonly");
    }
  });

  it("hashicorp vault + openbao share KV v2 path layout", async () => {
    const kv = new Map<string, string>();
    const http: VaultHttpClient = {
      async request({ method, url, body }) {
        const dataMatch = url.match(/\/data\/(.+)$/);
        const metaList = url.includes("/metadata") && url.includes("list=true");
        const metaDelete = method === "DELETE" && url.includes("/metadata/");
        if (metaList) {
          const prefix = decodeURIComponent(
            (url.split("/metadata/")[1] ?? "").replace(/\?list=true$/, "")
          );
          const keys = [...kv.keys()]
            .filter((k) => k.startsWith(prefix ? `${prefix}/` : "") || k === prefix)
            .map((k) => k.slice(prefix ? prefix.length + 1 : 0).split("/")[0] + "/")
            .filter(Boolean);
          return { status: 200, json: { data: { keys: [...new Set(keys)] } } };
        }
        if (metaDelete) {
          const path = decodeURIComponent(url.split("/metadata/")[1] ?? "");
          kv.delete(path);
          return { status: 204, json: null };
        }
        if (!dataMatch) return { status: 404, json: null };
        const path = decodeURIComponent(dataMatch[1]);
        if (method === "GET") {
          if (!kv.has(path)) return { status: 404, json: null };
          return { status: 200, json: { data: { data: { value: kv.get(path) } } } };
        }
        if (method === "POST" && body) {
          const parsed = JSON.parse(body) as { data: { value: string } };
          kv.set(path, parsed.data.value);
          return { status: 200, json: {} };
        }
        return { status: 500, json: null };
      },
    };

    const vault = createHashiCorpVaultStore({
      endpoint: "http://vault.test",
      token: "t",
      http,
    });
    await Effect.runPromise(vault.setSecret("oauth/google", JSON.stringify({ accessToken: "a" })));
    expect(await Effect.runPromise(vault.getSecret("oauth/google"))).toContain("accessToken");

    const bao = createOpenBaoStore({
      endpoint: "http://bao.test",
      token: "t",
      http,
    });
    expect(bao.kind).toBe("openbao");
    await Effect.runPromise(
      bao.setOAuthToken("slack", {
        accessToken: "s",
        expiresAtMs: Date.now() + 1000,
      })
    );
    expect((await Effect.runPromise(bao.getOAuthToken("slack")))?.accessToken).toBe("s");
  });

  it("resolveSecretStoreKind defaults to sqlite", () => {
    const prev = process.env.CLAWQL_SECRET_STORE;
    delete process.env.CLAWQL_SECRET_STORE;
    expect(resolveSecretStoreKind()).toBe("sqlite");
    process.env.CLAWQL_SECRET_STORE = "openbao";
    expect(resolveSecretStoreKind()).toBe("openbao");
    process.env.CLAWQL_SECRET_STORE = "vault";
    expect(resolveSecretStoreKind()).toBe("hashicorp-vault");
    if (prev === undefined) delete process.env.CLAWQL_SECRET_STORE;
    else process.env.CLAWQL_SECRET_STORE = prev;
  });

  it("createClawQLAuth accepts an injected secretStore", async () => {
    const mem = createMemorySecretStore();
    const auth = createClawQLAuth({ secretStore: mem });
    await Effect.runPromise(auth.secretStore.setSecret("x", "y"));
    expect(await Effect.runPromise(mem.getSecret("x"))).toBe("y");
  });

  it("resolveSecretStore({ kind: memory }) works without env", () => {
    const store = resolveSecretStore({ kind: "memory" });
    expect(store).toBeDefined();
  });
});
