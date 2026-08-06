import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  creditsDirectoryLiveLayer,
  CreditsDirectoryService,
  DirectoryError,
  looksLikeEmail,
  looksLikeHandle,
  looksLikePhone,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizeHandle,
  normalizePhone,
  RESERVED_HANDLES,
} from "./directory.js";

describe("payments directory email + username", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  const run = <A, E>(
    program: Effect.Effect<A, E, CreditsDirectoryService>,
    e: NodeJS.ProcessEnv = env
  ): Promise<A> => Effect.runPromise(program.pipe(Effect.provide(creditsDirectoryLiveLayer(e))));

  const withDir = <A, E>(
    body: (directory: CreditsDirectoryService["Type"]) => Effect.Effect<A, E, never>,
    e: NodeJS.ProcessEnv = env
  ): Promise<A> =>
    run(
      Effect.gen(function* () {
        const directory = yield* CreditsDirectoryService;
        return yield* body(directory);
      }),
      e
    );

  /** Run an expected-failure directory op and return the DirectoryError. */
  const failure = (
    body: (directory: CreditsDirectoryService["Type"]) => Effect.Effect<unknown, DirectoryError>,
    e: NodeJS.ProcessEnv = env
  ): Promise<DirectoryError> =>
    run(
      Effect.gen(function* () {
        const directory = yield* CreditsDirectoryService;
        return yield* body(directory).pipe(Effect.flip);
      }),
      e
    );

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-dir-"));
    env = { ...process.env, CLAWQL_HOME: home };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("normalizes email, username, and phone", () => {
    expect(normalizeEmail("Alice@Acme.COM")).toBe("alice@acme.com");
    expect(normalizeHandle("@Alice")).toBe("alice");
    expect(normalizePhone("+1 (555) 123-4567", env)).toBe("+15551234567");
    expect(normalizePhone("5551234567", env)).toBe("+15551234567");
    expect(looksLikeEmail("bob@x.com")).toBe(true);
    expect(looksLikeEmail("@bob")).toBe(false);
    expect(looksLikeHandle("@bob")).toBe(true);
    expect(looksLikeHandle("bob@x.com")).toBe(false);
    expect(looksLikePhone("+15551234567")).toBe(true);
    expect(looksLikePhone("555-123-4567")).toBe(true);
    expect(looksLikePhone("@bob")).toBe(false);
    expect(maskEmail("alice@acme.com")).toBe("a***e@acme.com");
    expect(maskPhone("+15551234567")).toMatch(/^\+1\*\*\*\d{4}$/);
    expect(RESERVED_HANDLES.has("venmo")).toBe(true);
  });

  it("claims email as default and optional privacy username", async () => {
    const result = await withDir((directory) =>
      Effect.gen(function* () {
        const claimed = yield* directory.claim({
          email: "Alice@Acme.com",
          tenantId: "t-alice",
          displayName: "Alice",
        });
        const byEmail = yield* directory.resolveRecipient("alice@acme.com");
        const updated = yield* directory.claim({ tenantId: "t-alice", handle: "@alice" });
        const byHandle = yield* directory.resolveRecipient("@alice");
        const tenant = yield* directory.getTenant("t-alice");
        const emailEntry = yield* directory.getEmail("alice@acme.com");
        const handleEntry = yield* directory.getHandle("alice");
        return { claimed, byEmail, updated, byHandle, tenant, emailEntry, handleEntry };
      })
    );

    expect(result.claimed.created).toBe(true);
    expect(result.claimed.entry.email).toBe("alice@acme.com");
    expect(result.claimed.entry.handle).toBeUndefined();

    expect(result.byEmail).toMatchObject({
      tenantId: "t-alice",
      via: "email",
      email: "alice@acme.com",
    });

    expect(result.updated.created).toBe(false);
    expect(result.updated.entry.handle).toBe("alice");
    expect(result.updated.entry.email).toBe("alice@acme.com");

    expect(result.byHandle.tenantId).toBe("t-alice");
    expect(result.byHandle.via).toBe("handle");
    expect(result.byHandle.email).toBe("alice@acme.com");

    expect(result.tenant?.handle).toBe("alice");
    expect(result.emailEntry?.handle).toBe("alice");
    expect(result.handleEntry?.email).toBe("alice@acme.com");
  });

  it("enforces uniqueness on email and username", async () => {
    await withDir((directory) => directory.claim({ email: "a@x.com", tenantId: "t1" }));
    const emailDup = await failure((directory) =>
      directory.claim({ email: "a@x.com", tenantId: "t2" })
    );
    expect(emailDup.reason).toMatch(/already claimed/);

    await withDir((directory) => directory.claim({ handle: "alice", tenantId: "t1" }));
    const handleDup = await failure((directory) =>
      directory.claim({ handle: "alice", tenantId: "t2" })
    );
    expect(handleDup.reason).toMatch(/already claimed/);
  });

  it("replaces prior username for same tenant", async () => {
    const result = await withDir((directory) =>
      Effect.gen(function* () {
        yield* directory.claim({ email: "a@x.com", handle: "oldname", tenantId: "t1" });
        yield* directory.claim({ handle: "newname", tenantId: "t1" });
        const oldHandle = yield* directory.getHandle("oldname");
        const tenant = yield* directory.getTenant("t1");
        return { oldHandle, tenant };
      })
    );
    expect(result.oldHandle).toBeUndefined();
    expect(result.tenant?.handle).toBe("newname");
    expect(result.tenant?.email).toBe("a@x.com");
  });

  it("releases username but keeps email", async () => {
    await withDir((directory) =>
      directory.claim({ email: "a@x.com", handle: "temp", tenantId: "t" })
    );
    const released = await withDir((directory) => directory.releaseHandle("@temp"));
    expect(released).toBe(true);
    const missing = await failure((directory) => directory.resolveRecipient("@temp"));
    expect(missing.reason).toMatch(/Unknown username/);
    const byEmail = await withDir((directory) => directory.resolveRecipient("a@x.com"));
    expect(byEmail.tenantId).toBe("t");
  });

  it("releases email but keeps username", async () => {
    await withDir((directory) =>
      directory.claim({ email: "a@x.com", handle: "alice", tenantId: "t" })
    );
    const released = await withDir((directory) => directory.releaseEmail("a@x.com"));
    expect(released).toBe(true);
    const missing = await failure((directory) => directory.resolveRecipient("a@x.com"));
    expect(missing.reason).toMatch(/Unknown email/);
    const byHandle = await withDir((directory) => directory.resolveRecipient("@alice"));
    expect(byHandle.tenantId).toBe("t");
  });

  it("lists profiles", async () => {
    const list = await withDir((directory) =>
      Effect.gen(function* () {
        yield* directory.claim({ email: "b@x.com", tenantId: "tb", handle: "bob" });
        yield* directory.claim({ email: "a@x.com", tenantId: "ta" });
        return yield* directory.list();
      })
    );
    expect(list.map((e) => e.tenantId).sort()).toEqual(["ta", "tb"]);
  });

  it("claims phone alias and resolves pay-by-phone", async () => {
    const result = await withDir((directory) =>
      Effect.gen(function* () {
        yield* directory.claim({ email: "bob@acme.com", tenantId: "bob" });
        const claimed = yield* directory.claim({
          phone: "+1 555 987 6543",
          tenantId: "bob",
          phoneVerified: true,
        });
        const byPhone = yield* directory.resolveRecipient("+15559876543");
        const phoneEntry = yield* directory.getPhone("555-987-6543");
        const released = yield* directory.releasePhone("+15559876543");
        return { claimed, byPhone, phoneEntry, released };
      })
    );
    expect(result.claimed.entry.phone).toBe("+15559876543");
    expect(result.claimed.entry.phoneVerifiedAt).toBeTruthy();
    expect(result.claimed.entry.email).toBe("bob@acme.com");

    expect(result.byPhone).toMatchObject({
      tenantId: "bob",
      via: "phone",
      email: "bob@acme.com",
      phone: "+15559876543",
    });
    expect(result.phoneEntry?.tenantId).toBe("bob");
    expect(result.released).toBe(true);

    const missing = await failure((directory) => directory.resolveRecipient("+15559876543"));
    expect(missing.reason).toMatch(/Unknown phone/);
    const byEmail = await withDir((directory) => directory.resolveRecipient("bob@acme.com"));
    expect(byEmail.tenantId).toBe("bob");
  });

  it("requires verified assertion when phone gate is on", async () => {
    const gated = { ...env, CLAWQL_CREDITS_PHONE_REQUIRE_VERIFIED: "1" };
    await withDir((directory) => directory.claim({ email: "c@x.com", tenantId: "c" }), gated);
    const denied = await failure(
      (directory) => directory.claim({ phone: "+15551112222", tenantId: "c" }),
      gated
    );
    expect(denied.reason).toMatch(/verified assertion/);
    const ok = await withDir(
      (directory) => directory.claim({ phone: "+15551112222", tenantId: "c", phoneVerified: true }),
      gated
    );
    expect(ok.entry.phone).toBe("+15551112222");
  });

  it("enforces phone uniqueness", async () => {
    await withDir((directory) =>
      directory.claim({ email: "a@x.com", phone: "+15550001111", tenantId: "t1" })
    );
    const dup = await failure((directory) =>
      directory.claim({ email: "b@x.com", phone: "+15550001111", tenantId: "t2" })
    );
    expect(dup.reason).toMatch(/already claimed/);
  });
});
