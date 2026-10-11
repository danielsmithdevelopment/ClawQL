import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { IdentityStoreService, identityStoreLayerForPath } from "./store.js";

describe("IdentityStoreService", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  function layerForTemp(): Promise<ReturnType<typeof identityStoreLayerForPath>> {
    return mkdtemp(join(tmpdir(), "clawql-identities-")).then((dir) => {
      dirs.push(dir);
      return identityStoreLayerForPath(join(dir, "identities.json"));
    });
  }

  it("creates a usr_ id and reuses it for the same supabase subject", async () => {
    const layer = await layerForTemp();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* IdentityStoreService;
        const a = yield* svc.getOrCreateFromLinkedIdentity({
          provider: "supabase",
          subject: "sb-user-1",
          email: "a@b.co",
        });
        const b = yield* svc.getOrCreateFromLinkedIdentity({
          provider: "supabase",
          subject: "sb-user-1",
        });
        return { a, b };
      }).pipe(Effect.provide(layer))
    );
    expect(result.a.userId).toMatch(/^usr_[a-f0-9]{16}$/);
    expect(result.b.userId).toBe(result.a.userId);
    expect(result.a.userId).not.toMatch(/^supabase:/);
    expect(result.a.identities).toEqual([
      expect.objectContaining({ provider: "supabase", subject: "sb-user-1" }),
    ]);
  });

  it("links okta without changing the ClawQL user id", async () => {
    const layer = await layerForTemp();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* IdentityStoreService;
        const user = yield* svc.getOrCreateFromLinkedIdentity({
          provider: "supabase",
          subject: "sb-1",
        });
        const linked = yield* svc.linkIdentity({
          userId: user.userId,
          provider: "okta",
          subject: "okta-sub-9",
        });
        const byOkta = yield* svc.getByLinkedIdentity("okta", "okta-sub-9");
        return { user, linked, byOkta };
      }).pipe(Effect.provide(layer))
    );
    expect(result.linked.userId).toBe(result.user.userId);
    expect(result.byOkta?.userId).toBe(result.user.userId);
    expect(result.linked.identities.map((i) => i.provider).sort()).toEqual(["okta", "supabase"]);
  });

  it("does not key the tenant on the provider subject", async () => {
    const layer = await layerForTemp();
    const user = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* IdentityStoreService;
        return yield* svc.getOrCreateFromLinkedIdentity({ provider: "supabase", subject: "abc" });
      }).pipe(Effect.provide(layer))
    );
    expect(user.userId.startsWith("usr_")).toBe(true);
    expect(user.userId).not.toBe("supabase:abc");
  });

  it("deletes the identity record", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-identities-"));
    dirs.push(dir);
    const path = join(dir, "identities.json");
    const layer = identityStoreLayerForPath(path);
    const leftover = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* IdentityStoreService;
        const user = yield* svc.getOrCreateFromLinkedIdentity({
          provider: "supabase",
          subject: "gone",
        });
        yield* svc.deleteUser(user.userId);
        return yield* svc.getByUserId(user.userId);
      }).pipe(Effect.provide(layer))
    );
    expect(leftover).toBeUndefined();
    const raw = await readFile(path, "utf8");
    expect(raw).not.toContain("gone");
  });
});
