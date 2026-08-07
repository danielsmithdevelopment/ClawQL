import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { CreditsContactsService, maskContactPayee, normalizeContactPayee } from "./contacts.js";
import { CreditsDirectoryService } from "./directory.js";

describe("credits contacts book", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-contacts-"));
    env = { ...process.env, CLAWQL_HOME: home };
    resetPaymentsEffectRuntimeForTests();
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
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
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const contacts = yield* CreditsContactsService;
        const added = yield* contacts.add({
          ownerTenantId: "alice",
          payee: "bob@acme.com",
          label: "Bob",
        });
        const again = yield* contacts.add({
          ownerTenantId: "alice",
          payee: "Bob@Acme.com",
          label: "Bobby",
        });
        const listBefore = yield* contacts.list("alice");
        const removed = yield* contacts.remove("alice", added.contact.contactId);
        const listAfter = yield* contacts.list("alice");
        return { added, again, listBefore, removed, listAfter };
      }),
      env
    );

    expect(result.added.created).toBe(true);
    expect(result.added.contact.payee).toBe("bob@acme.com");
    expect(result.added.contact.label).toBe("Bob");

    expect(result.again.created).toBe(false);
    expect(result.again.contact.contactId).toBe(result.added.contact.contactId);
    expect(result.again.contact.label).toBe("Bobby");

    expect(result.listBefore).toHaveLength(1);
    expect(result.removed).toBe(true);
    expect(result.listAfter).toHaveLength(0);
  });

  it("resolves contact through directory", async () => {
    const resolved = await runPaymentsEffect(
      Effect.gen(function* () {
        const directory = yield* CreditsDirectoryService;
        yield* directory.claim({ email: "bob@acme.com", handle: "bob", tenantId: "bob" });
        const contacts = yield* CreditsContactsService;
        const { contact } = yield* contacts.add({
          ownerTenantId: "alice",
          payee: "@bob",
          label: "Bobby",
        });
        return yield* contacts.resolvePayee("alice", { contactId: contact.contactId });
      }),
      env
    );
    expect(resolved.recipient.tenantId).toBe("bob");
    expect(resolved.recipient.via).toBe("handle");
    expect(resolved.payee).toBe("@bob");
  });

  it("keeps owner books separate", async () => {
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const contacts = yield* CreditsContactsService;
        yield* contacts.add({ ownerTenantId: "alice", payee: "a@x.com" });
        yield* contacts.add({ ownerTenantId: "carol", payee: "c@x.com" });
        return {
          alice: yield* contacts.list("alice"),
          carol: yield* contacts.list("carol"),
        };
      }),
      env
    );
    expect(result.alice).toHaveLength(1);
    expect(result.carol).toHaveLength(1);
    expect(result.alice[0]!.payee).toBe("a@x.com");
  });
});
