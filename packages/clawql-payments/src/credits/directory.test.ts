import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  claimDirectory,
  claimHandle,
  claimPhone,
  getEmailEntry,
  getHandleEntry,
  getPhoneEntry,
  getTenantEntry,
  listDirectory,
  looksLikeEmail,
  looksLikeHandle,
  looksLikePhone,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizeHandle,
  normalizePhone,
  releaseEmail,
  releaseHandle,
  releasePhone,
  resetDirectoryForTests,
  resolveRecipient,
  RESERVED_HANDLES,
} from "./directory.js";

describe("payments directory email + username", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-dir-"));
    env = { ...process.env, CLAWQL_HOME: home };
    await resetDirectoryForTests(env);
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
    const { entry, created } = await claimDirectory(
      {
        email: "Alice@Acme.com",
        tenantId: "t-alice",
        displayName: "Alice",
      },
      env
    );
    expect(created).toBe(true);
    expect(entry.email).toBe("alice@acme.com");
    expect(entry.handle).toBeUndefined();

    const byEmail = await resolveRecipient("alice@acme.com", env);
    expect(byEmail).toMatchObject({
      tenantId: "t-alice",
      via: "email",
      email: "alice@acme.com",
    });

    // Add privacy username later
    const updated = await claimDirectory({ tenantId: "t-alice", handle: "@alice" }, env);
    expect(updated.created).toBe(false);
    expect(updated.entry.handle).toBe("alice");
    expect(updated.entry.email).toBe("alice@acme.com");

    const byHandle = await resolveRecipient("@alice", env);
    expect(byHandle.tenantId).toBe("t-alice");
    expect(byHandle.via).toBe("handle");
    // Prefer showing username; email still on profile
    expect(byHandle.email).toBe("alice@acme.com");

    expect((await getTenantEntry("t-alice", env))?.handle).toBe("alice");
    expect((await getEmailEntry("alice@acme.com", env))?.handle).toBe("alice");
    expect((await getHandleEntry("alice", env))?.email).toBe("alice@acme.com");
  });

  it("enforces uniqueness on email and username", async () => {
    await claimDirectory({ email: "a@x.com", tenantId: "t1" }, env);
    await expect(claimDirectory({ email: "a@x.com", tenantId: "t2" }, env)).rejects.toThrow(
      /already claimed/
    );

    await claimHandle({ handle: "alice", tenantId: "t1" }, env);
    await expect(claimHandle({ handle: "alice", tenantId: "t2" }, env)).rejects.toThrow(
      /already claimed/
    );
  });

  it("replaces prior username for same tenant", async () => {
    await claimDirectory({ email: "a@x.com", handle: "oldname", tenantId: "t1" }, env);
    await claimDirectory({ handle: "newname", tenantId: "t1" }, env);
    expect(await getHandleEntry("oldname", env)).toBeUndefined();
    expect((await getTenantEntry("t1", env))?.handle).toBe("newname");
    expect((await getTenantEntry("t1", env))?.email).toBe("a@x.com");
  });

  it("releases username but keeps email", async () => {
    await claimDirectory({ email: "a@x.com", handle: "temp", tenantId: "t" }, env);
    expect(await releaseHandle("@temp", env)).toBe(true);
    await expect(resolveRecipient("@temp", env)).rejects.toThrow(/Unknown username/);
    expect((await resolveRecipient("a@x.com", env)).tenantId).toBe("t");
  });

  it("releases email but keeps username", async () => {
    await claimDirectory({ email: "a@x.com", handle: "alice", tenantId: "t" }, env);
    expect(await releaseEmail("a@x.com", env)).toBe(true);
    await expect(resolveRecipient("a@x.com", env)).rejects.toThrow(/Unknown email/);
    expect((await resolveRecipient("@alice", env)).tenantId).toBe("t");
  });

  it("lists profiles", async () => {
    await claimDirectory({ email: "b@x.com", tenantId: "tb", handle: "bob" }, env);
    await claimDirectory({ email: "a@x.com", tenantId: "ta" }, env);
    const list = await listDirectory(env);
    expect(list.map((e) => e.tenantId).sort()).toEqual(["ta", "tb"]);
  });

  it("claims phone alias and resolves pay-by-phone", async () => {
    await claimDirectory({ email: "bob@acme.com", tenantId: "bob" }, env);
    const { entry } = await claimPhone(
      { phone: "+1 555 987 6543", tenantId: "bob", phoneVerified: true },
      env
    );
    expect(entry.phone).toBe("+15559876543");
    expect(entry.phoneVerifiedAt).toBeTruthy();
    expect(entry.email).toBe("bob@acme.com");

    const byPhone = await resolveRecipient("+15559876543", env);
    expect(byPhone).toMatchObject({
      tenantId: "bob",
      via: "phone",
      email: "bob@acme.com",
      phone: "+15559876543",
    });
    expect((await getPhoneEntry("555-987-6543", env))?.tenantId).toBe("bob");

    expect(await releasePhone("+15559876543", env)).toBe(true);
    await expect(resolveRecipient("+15559876543", env)).rejects.toThrow(/Unknown phone/);
    expect((await resolveRecipient("bob@acme.com", env)).tenantId).toBe("bob");
  });

  it("requires verified assertion when phone gate is on", async () => {
    const gated = { ...env, CLAWQL_CREDITS_PHONE_REQUIRE_VERIFIED: "1" };
    await claimDirectory({ email: "c@x.com", tenantId: "c" }, gated);
    await expect(claimDirectory({ phone: "+15551112222", tenantId: "c" }, gated)).rejects.toThrow(
      /verified assertion/
    );
    const ok = await claimDirectory(
      { phone: "+15551112222", tenantId: "c", phoneVerified: true },
      gated
    );
    expect(ok.entry.phone).toBe("+15551112222");
  });

  it("enforces phone uniqueness", async () => {
    await claimDirectory({ email: "a@x.com", phone: "+15550001111", tenantId: "t1" }, env);
    await expect(
      claimDirectory({ email: "b@x.com", phone: "+15550001111", tenantId: "t2" }, env)
    ).rejects.toThrow(/already claimed/);
  });
});
