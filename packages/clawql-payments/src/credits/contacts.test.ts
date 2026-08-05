import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addContact,
  listContacts,
  maskContactPayee,
  normalizeContactPayee,
  removeContact,
  resetContactsForTests,
  resolveContactPayee,
} from "./contacts.js";
import { claimDirectory, resetDirectoryForTests } from "./directory.js";

describe("credits contacts book", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-contacts-"));
    env = { ...process.env, CLAWQL_HOME: home };
    await resetDirectoryForTests(env);
    await resetContactsForTests(env);
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("normalizes and masks payees", () => {
    expect(normalizeContactPayee("Bob@Acme.com")).toBe("bob@acme.com");
    expect(normalizeContactPayee("@Alice")).toBe("@alice");
    expect(normalizeContactPayee("5551234567")).toBe("+15551234567");
    expect(maskContactPayee("alice@acme.com")).toContain("***");
    expect(maskContactPayee("+15551234567")).toMatch(/\*\*\*/);
  });

  it("adds, lists, updates, removes contacts", async () => {
    const { contact, created } = await addContact(
      { ownerTenantId: "alice", payee: "bob@acme.com", label: "Bob" },
      env
    );
    expect(created).toBe(true);
    expect(contact.payee).toBe("bob@acme.com");
    expect(contact.label).toBe("Bob");

    const again = await addContact(
      { ownerTenantId: "alice", payee: "Bob@Acme.com", label: "Bobby" },
      env
    );
    expect(again.created).toBe(false);
    expect(again.contact.contactId).toBe(contact.contactId);
    expect(again.contact.label).toBe("Bobby");

    const list = await listContacts("alice", env);
    expect(list).toHaveLength(1);

    expect(await removeContact("alice", contact.contactId, env)).toBe(true);
    expect(await listContacts("alice", env)).toHaveLength(0);
  });

  it("resolves contact through directory", async () => {
    await claimDirectory({ email: "bob@acme.com", handle: "bob", tenantId: "bob" }, env);
    const { contact } = await addContact(
      { ownerTenantId: "alice", payee: "@bob", label: "Bobby" },
      env
    );
    const resolved = await resolveContactPayee(
      "alice",
      { contactId: contact.contactId },
      env
    );
    expect(resolved.recipient.tenantId).toBe("bob");
    expect(resolved.recipient.via).toBe("handle");
    expect(resolved.payee).toBe("@bob");
  });

  it("keeps owner books separate", async () => {
    await addContact({ ownerTenantId: "alice", payee: "a@x.com" }, env);
    await addContact({ ownerTenantId: "carol", payee: "c@x.com" }, env);
    expect(await listContacts("alice", env)).toHaveLength(1);
    expect(await listContacts("carol", env)).toHaveLength(1);
    expect((await listContacts("alice", env))[0]!.payee).toBe("a@x.com");
  });
});
