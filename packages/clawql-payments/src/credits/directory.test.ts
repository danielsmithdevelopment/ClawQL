import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  claimDirectory,
  claimHandle,
  getEmailEntry,
  getHandleEntry,
  getTenantEntry,
  listDirectory,
  looksLikeEmail,
  looksLikeHandle,
  maskEmail,
  normalizeEmail,
  normalizeHandle,
  releaseEmail,
  releaseHandle,
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

  it("normalizes email and username", () => {
    expect(normalizeEmail("Alice@Acme.COM")).toBe("alice@acme.com");
    expect(normalizeHandle("@Alice")).toBe("alice");
    expect(looksLikeEmail("bob@x.com")).toBe(true);
    expect(looksLikeEmail("@bob")).toBe(false);
    expect(looksLikeHandle("@bob")).toBe(true);
    expect(looksLikeHandle("bob@x.com")).toBe(false);
    expect(maskEmail("alice@acme.com")).toBe("a***e@acme.com");
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
    const updated = await claimDirectory(
      { tenantId: "t-alice", handle: "@alice" },
      env
    );
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
    await expect(
      claimDirectory({ email: "a@x.com", tenantId: "t2" }, env)
    ).rejects.toThrow(/already claimed/);

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
});
