import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import { createIssuedApiKeyStore } from "./store.js";
import { parseApiKeySecretEffect } from "./crypto.js";
import { resolveAtrClaimsFromHeaders } from "../gateway.js";

describe("IssuedApiKeyStore", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function tempStore(events?: AuthEvent[]) {
    const dir = await mkdtemp(join(tmpdir(), "clawql-api-keys-"));
    dirs.push(dir);
    const path = join(dir, "api-keys.json");
    const store = createIssuedApiKeyStore({
      path,
      eventSink: events
        ? (e) => {
            events.push(e);
          }
        : undefined,
    });
    return { store, path, events };
  }

  it("issues a cqk_ secret, validates it, and never persists plaintext", async () => {
    const events: AuthEvent[] = [];
    const { store, path } = await tempStore(events);

    const issued = await Effect.runPromise(
      store.issue({
        subjectId: "user-1",
        orgId: "org-acme",
        teamId: "eng",
        role: "operator",
        label: "ci",
      })
    );

    expect(issued.record.id).toMatch(/^cqk_[a-f0-9]{16}$/);
    expect(issued.secret.startsWith(issued.record.id + "_")).toBe(true);
    expect((await Effect.runPromise(parseApiKeySecretEffect(issued.secret)))?.id).toBe(
      issued.record.id
    );

    const raw = await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8"));
    const secretPart = issued.secret.slice(issued.record.id.length + 1);
    expect(secretPart.length).toBeGreaterThan(8);
    expect(raw).not.toContain(secretPart);
    expect(raw).toContain(issued.record.secretHash);

    const ok = await Effect.runPromise(store.validate(issued.secret));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.record.orgId).toBe("org-acme");
      expect(ok.record.teamId).toBe("eng");
    }

    expect(events.some((e) => e.type === "API_KEY_ISSUED")).toBe(true);
    await Effect.runPromise(
      Effect.sleep("20 millis").pipe(
        Effect.map(() => expect(events.some((e) => e.type === "API_KEY_USED")).toBe(true))
      )
    );
  });

  it("rejects wrong secret, revoked, and expired keys", async () => {
    const { store } = await tempStore();
    const issued = await Effect.runPromise(store.issue({ subjectId: "u", orgId: "o" }));

    expect((await Effect.runPromise(store.validate("not-a-key"))).ok).toBe(false);
    expect((await Effect.runPromise(store.validate(`${issued.record.id}_wrongsecret`))).ok).toBe(
      false
    );

    await Effect.runPromise(store.revoke(issued.record.id));
    expect((await Effect.runPromise(store.validate(issued.secret))).ok).toBe(false);

    const expired = await Effect.runPromise(
      store.issue({
        subjectId: "u2",
        expiresAt: new Date(Date.now() - 60_000),
      })
    );
    expect((await Effect.runPromise(store.validate(expired.secret))).ok).toBe(false);
  });

  it("lists active keys filtered by org/team", async () => {
    const { store } = await tempStore();
    await Effect.runPromise(store.issue({ subjectId: "a", orgId: "org1", teamId: "t1" }));
    await Effect.runPromise(store.issue({ subjectId: "b", orgId: "org1", teamId: "t2" }));
    await Effect.runPromise(store.issue({ subjectId: "c", orgId: "org2", teamId: "t1" }));
    const rev = await Effect.runPromise(
      store.issue({ subjectId: "d", orgId: "org1", teamId: "t1" })
    );
    await Effect.runPromise(store.revoke(rev.record.id));

    expect(await Effect.runPromise(store.listActive({ orgId: "org1" }))).toHaveLength(2);
    expect(await Effect.runPromise(store.listActive({ orgId: "org1", teamId: "t1" }))).toHaveLength(
      1
    );
  });

  it("wires as gateway ApiKeyClaimsResolver", async () => {
    const { store } = await tempStore();
    const issued = await Effect.runPromise(
      store.issue({
        subjectId: "alice",
        orgId: "acme",
        role: "admin",
        scope: ["execute", "search"],
      })
    );

    const result = resolveAtrClaimsFromHeaders(
      { "x-api-key": issued.secret },
      {
        mode: "apiKey",
        apiKeyClaimsResolver: store.asClaimsResolver(),
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe("alice");
      expect(result.claims.orgId).toBe("acme");
      expect(result.claims.virtualKeyId).toBe(issued.record.id);
      expect(result.claims.scope).toEqual(["execute", "search"]);
    }

    // Non-cqk keys fall through (null) so static CLAWQL_API_KEY can match
    const fallthrough = store.asClaimsResolver()("static-env-key", {});
    expect(fallthrough).toBeNull();
  });

  it("serializes concurrent issue without losing keys", async () => {
    const { store } = await tempStore();
    const results = await Effect.runPromise(
      Effect.all(
        Array.from({ length: 20 }, (_, i) =>
          store.issue({ subjectId: `u${i}`, orgId: "org", teamId: "team" })
        ),
        { concurrency: "unbounded" }
      )
    );
    expect(new Set(results.map((r) => r.record.id)).size).toBe(20);
    expect(await Effect.runPromise(store.listActive({ orgId: "org" }))).toHaveLength(20);
  });
});
