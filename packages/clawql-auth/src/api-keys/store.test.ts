import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import { createIssuedApiKeyStore } from "./store.js";
import { parseApiKeySecret } from "./crypto.js";
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

    const issued = await store.issue({
      subjectId: "user-1",
      orgId: "org-acme",
      teamId: "eng",
      role: "operator",
      label: "ci",
    });

    expect(issued.record.id).toMatch(/^cqk_[a-f0-9]{16}$/);
    expect(issued.secret.startsWith(issued.record.id + "_")).toBe(true);
    expect(parseApiKeySecret(issued.secret)?.id).toBe(issued.record.id);

    const raw = await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8"));
    expect(raw).not.toContain(issued.secret.split("_").pop());
    expect(raw).toContain(issued.record.secretHash);

    const ok = store.validate(issued.secret);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.record.orgId).toBe("org-acme");
      expect(ok.record.teamId).toBe("eng");
    }

    expect(events.some((e) => e.type === "API_KEY_ISSUED")).toBe(true);
    expect(events.some((e) => e.type === "API_KEY_USED")).toBe(true);
  });

  it("rejects wrong secret, revoked, and expired keys", async () => {
    const { store } = await tempStore();
    const issued = await store.issue({ subjectId: "u", orgId: "o" });

    expect(store.validate("not-a-key").ok).toBe(false);
    expect(store.validate(`${issued.record.id}_wrongsecret`).ok).toBe(false);

    await store.revoke(issued.record.id);
    expect(store.validate(issued.secret).ok).toBe(false);

    const expired = await store.issue({
      subjectId: "u2",
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(store.validate(expired.secret).ok).toBe(false);
  });

  it("lists active keys filtered by org/team", async () => {
    const { store } = await tempStore();
    await store.issue({ subjectId: "a", orgId: "org1", teamId: "t1" });
    await store.issue({ subjectId: "b", orgId: "org1", teamId: "t2" });
    await store.issue({ subjectId: "c", orgId: "org2", teamId: "t1" });
    const rev = await store.issue({ subjectId: "d", orgId: "org1", teamId: "t1" });
    await store.revoke(rev.record.id);

    expect(store.listActive({ orgId: "org1" })).toHaveLength(2);
    expect(store.listActive({ orgId: "org1", teamId: "t1" })).toHaveLength(1);
  });

  it("wires as gateway ApiKeyClaimsResolver", async () => {
    const { store } = await tempStore();
    const issued = await store.issue({
      subjectId: "alice",
      orgId: "acme",
      role: "admin",
      scope: ["execute", "search"],
    });

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
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.issue({ subjectId: `u${i}`, orgId: "org", teamId: "team" })
      )
    );
    expect(new Set(results.map((r) => r.record.id)).size).toBe(20);
    expect(store.listActive({ orgId: "org" })).toHaveLength(20);
  });
});
