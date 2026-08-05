/**
 * Per-tenant contacts book — save frequent payees (email / @username / phone / tenant).
 * Stored under Payments/contacts.json (mode 0600); never written to payment WORM.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolvePaymentsDir } from "../config/paths.js";
import {
  looksLikeEmail,
  looksLikeHandle,
  looksLikePhone,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizeHandle,
  normalizePhone,
  resolveRecipient,
  type ResolvedRecipient,
} from "./directory.js";

export type ContactEntry = {
  readonly contactId: string;
  /** Raw payee string as saved (email, @handle, +E.164, or tenant id). */
  readonly payee: string;
  readonly label?: string;
  readonly addedAt: string;
  readonly updatedAt: string;
};

type OwnerBook = {
  contacts: ContactEntry[];
};

type ContactsFile = {
  version: 1;
  byOwner: Record<string, OwnerBook>;
};

export function resolveContactsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "contacts.json");
}

function emptyFile(): ContactsFile {
  return { version: 1, byOwner: {} };
}

async function loadFile(env: NodeJS.ProcessEnv): Promise<ContactsFile> {
  try {
    const raw = await readFile(resolveContactsPath(env), "utf8");
    const parsed = JSON.parse(raw) as ContactsFile;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) return emptyFile();
    return {
      version: 1,
      byOwner:
        parsed.byOwner && typeof parsed.byOwner === "object" ? parsed.byOwner : {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyFile();
    throw err;
  }
}

async function saveFile(file: ContactsFile, env: NodeJS.ProcessEnv): Promise<void> {
  const path = resolveContactsPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

/** Normalize payee for storage / dedupe (not for display). */
export function normalizeContactPayee(raw: string): string {
  const input = raw.trim();
  if (!input) throw new Error("Payee required");
  if (looksLikePhone(input)) return normalizePhone(input);
  if (looksLikeEmail(input)) return normalizeEmail(input);
  if (input.startsWith("@") || looksLikeHandle(input)) return `@${normalizeHandle(input)}`;
  return input;
}

export function maskContactPayee(payee: string): string {
  if (looksLikePhone(payee)) return maskPhone(payee);
  if (looksLikeEmail(payee)) return maskEmail(payee);
  return payee;
}

export async function listContacts(
  ownerTenantId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<ContactEntry[]> {
  const owner = ownerTenantId.trim();
  if (!owner) throw new Error("ownerTenantId required");
  const file = await loadFile(env);
  const book = file.byOwner[owner];
  if (!book) return [];
  return [...book.contacts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getContact(
  ownerTenantId: string,
  contactId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<ContactEntry | undefined> {
  const list = await listContacts(ownerTenantId, env);
  return list.find((c) => c.contactId === contactId.trim());
}

export type AddContactInput = {
  ownerTenantId: string;
  payee: string;
  label?: string;
};

export async function addContact(
  input: AddContactInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ contact: ContactEntry; created: boolean }> {
  const owner = input.ownerTenantId.trim();
  if (!owner) throw new Error("ownerTenantId required");
  const payee = normalizeContactPayee(input.payee);
  const label = input.label?.trim() || undefined;

  const file = await loadFile(env);
  const book = file.byOwner[owner] ?? { contacts: [] };
  const existing = book.contacts.find((c) => normalizeContactPayee(c.payee) === payee);
  const now = new Date().toISOString();

  if (existing) {
    const updated: ContactEntry = {
      ...existing,
      payee,
      label: label ?? existing.label,
      updatedAt: now,
    };
    book.contacts = book.contacts.map((c) =>
      c.contactId === existing.contactId ? updated : c
    );
    file.byOwner[owner] = book;
    await saveFile(file, env);
    return { contact: updated, created: false };
  }

  const contact: ContactEntry = {
    contactId: randomUUID(),
    payee,
    label,
    addedAt: now,
    updatedAt: now,
  };
  book.contacts.push(contact);
  file.byOwner[owner] = book;
  await saveFile(file, env);
  return { contact, created: true };
}

export async function removeContact(
  ownerTenantId: string,
  contactId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const owner = ownerTenantId.trim();
  const id = contactId.trim();
  if (!owner || !id) return false;
  const file = await loadFile(env);
  const book = file.byOwner[owner];
  if (!book) return false;
  const before = book.contacts.length;
  book.contacts = book.contacts.filter((c) => c.contactId !== id);
  if (book.contacts.length === before) return false;
  file.byOwner[owner] = book;
  await saveFile(file, env);
  return true;
}

/** Resolve a contact id or raw payee to a directory recipient. */
export async function resolveContactPayee(
  ownerTenantId: string,
  input: { contactId?: string; payee?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ contact?: ContactEntry; recipient: ResolvedRecipient; payee: string }> {
  let payee = input.payee?.trim();
  let contact: ContactEntry | undefined;
  if (input.contactId?.trim()) {
    contact = await getContact(ownerTenantId, input.contactId, env);
    if (!contact) throw new Error(`Unknown contact id ${input.contactId.trim()}`);
    payee = contact.payee;
  }
  if (!payee) throw new Error("Provide --contact-id or --to payee");
  const recipient = await resolveRecipient(payee, env, {
    forceEmail: looksLikeEmail(payee),
    forceHandle: payee.startsWith("@"),
    forcePhone: looksLikePhone(payee),
  });
  return { contact, recipient, payee };
}

export async function resetContactsForTests(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await saveFile(emptyFile(), env);
}
