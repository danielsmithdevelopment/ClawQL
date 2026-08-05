import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  claimHandle,
  getHandleEntry,
  getTenantHandle,
  listDirectory,
  looksLikeHandle,
  normalizeHandle,
  releaseHandle,
  resetDirectoryForTests,
  resolveRecipient,
  RESERVED_HANDLES,
} from "./directory.js";

describe("payments directory handles", () => {
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

  it("normalizes @handles", () => {
    expect(normalizeHandle("@Alice")).toBe("alice");
    expect(normalizeHandle("bob_1")).toBe("bob_1");
    expect(() => normalizeHandle("ab")).toThrow(/Invalid/);
    expect(() => normalizeHandle("1abc")).toThrow(/Invalid/);
    expect(() => normalizeHandle("venmo")).toThrow(/reserved/);
    expect(RESERVED_HANDLES.has("clawql")).toBe(true);
  });

  it("looksLikeHandle distinguishes non-handle strings", () => {
    expect(looksLikeHandle("@alice")).toBe(true);
    expect(looksLikeHandle("alice")).toBe(true);
    expect(looksLikeHandle("Acme Corp")).toBe(false);
    expect(looksLikeHandle("ab")).toBe(false);
    expect(looksLikeHandle("tenant/with/slash")).toBe(false);
  });

  it("claims, resolves, and enforces uniqueness", async () => {
    const { entry, created } = await claimHandle(
      { handle: "@Alice", tenantId: "t-alice", displayName: "Alice" },
      env
    );
    expect(created).toBe(true);
    expect(entry.handle).toBe("alice");
    expect(entry.tenantId).toBe("t-alice");

    const got = await getHandleEntry("@alice", env);
    expect(got?.displayName).toBe("Alice");
    expect((await getTenantHandle("t-alice", env))?.handle).toBe("alice");

    await expect(
      claimHandle({ handle: "alice", tenantId: "other" }, env)
    ).rejects.toThrow(/already claimed/);

    const resolved = await resolveRecipient("@alice", env);
    expect(resolved).toMatchObject({
      tenantId: "t-alice",
      handle: "alice",
      via: "handle",
    });

    const raw = await resolveRecipient("raw-tenant-99", env);
    expect(raw).toEqual({ tenantId: "raw-tenant-99", via: "tenantId" });

    // Bare unclaimed handle-shaped string → tenant id (compat)
    const bare = await resolveRecipient("unclaimed", env);
    expect(bare).toEqual({ tenantId: "unclaimed", via: "tenantId" });
    await expect(resolveRecipient("@unclaimed", env)).rejects.toThrow(/Unknown handle/);
  });

  it("replaces prior handle for same tenant", async () => {
    await claimHandle({ handle: "oldname", tenantId: "t1" }, env);
    await claimHandle({ handle: "newname", tenantId: "t1" }, env);
    expect(await getHandleEntry("oldname", env)).toBeUndefined();
    expect((await getTenantHandle("t1", env))?.handle).toBe("newname");
    expect((await listDirectory(env)).map((e) => e.handle)).toEqual(["newname"]);
  });

  it("releases handles", async () => {
    await claimHandle({ handle: "temp", tenantId: "t" }, env);
    expect(await releaseHandle("@temp", env)).toBe(true);
    await expect(resolveRecipient("@temp", env)).rejects.toThrow(/Unknown handle/);
  });
});
