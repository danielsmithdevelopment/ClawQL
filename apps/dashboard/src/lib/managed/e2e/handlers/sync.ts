/**
 * Directory / IdP sync for Cloud E2E (SCIM-shaped + Keycloak realm groups).
 * Production-shaped POST /sync/directory and POST /sync/scim.
 * Pass-when for SI-07/08 remains /decision or CDP approve + /audit.
 */
import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { appendAudit, personByName } from "@/lib/managed/e2e/world";

export type DirectorySyncBody = {
  /** Prefer "scim" / "keycloak"; "okta-shaped" kept for arrange façades. */
  provider?: "scim" | "keycloak" | "okta-shaped";
  removeJordanFromSupport?: boolean;
  deactivatePriya?: boolean;
  addJordanToLegal?: boolean;
  /** SCIM PatchOp (RFC 7644) — mapped onto Acme people. */
  schemas?: string[];
  Operations?: Array<{
    op: string;
    path?: string;
    value?: unknown;
    userName?: string;
  }>;
};

const EMAIL_TO_PERSON: Record<string, string> = {
  "jordan.park@acme.test": "Jordan Park",
  "jordan.park": "Jordan Park",
  "priya.shah@acme.test": "Priya Shah",
  "priya.shah": "Priya Shah",
  "dana.reyes@acme.test": "Dana Reyes",
  "dana.reyes": "Dana Reyes",
};

function actorFor(provider: DirectorySyncBody["provider"]): string {
  if (provider === "scim" || provider === "keycloak") return "scim";
  return "okta";
}

function resolvePersonName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  return EMAIL_TO_PERSON[key] ?? personByName(raw)?.name;
}

function applyRemoveFromGroup(
  personName: string,
  group: string,
  actor: string,
  applied: string[],
): void {
  const person = personByName(personName);
  if (!person) return;
  person.groups = person.groups.filter((g) => g !== group);
  if (group === "Support") person.canAnswerTicketTriage = false;
  if (group === "Legal") person.canApproveContracts = false;
  appendAudit(actor, "sync.group", `${personName} removed from ${group}`);
  applied.push(`remove:${personName}:${group}`);
}

function applyAddToGroup(
  personName: string,
  group: string,
  actor: string,
  applied: string[],
): void {
  const person = personByName(personName);
  if (!person) return;
  if (!person.groups.includes(group)) person.groups.push(group);
  if (group === "Legal") person.canApproveContracts = true;
  if (group === "Support") person.canAnswerTicketTriage = true;
  appendAudit(actor, "sync.group", `${personName} added to ${group}`);
  applied.push(`add:${personName}:${group}`);
}

function applyDeactivate(personName: string, actor: string, applied: string[]): void {
  const person = personByName(personName);
  if (!person) return;
  person.active = false;
  appendAudit(actor, "sync.deactivate", `${personName.split(" ")[0]} deactivated`);
  applied.push(`deactivate:${personName}`);
}

function applyScimOperations(
  ops: NonNullable<DirectorySyncBody["Operations"]>,
  actor: string,
  applied: string[],
): void {
  for (const op of ops) {
    const verb = (op.op ?? "").toLowerCase();
    const path = (op.path ?? "").toLowerCase();
    const value = op.value;
    const valueObj =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const userName =
      (typeof op.userName === "string" && op.userName) ||
      (typeof valueObj.userName === "string" && valueObj.userName) ||
      (typeof valueObj.value === "string" && valueObj.value) ||
      undefined;
    const personName = resolvePersonName(userName);

    const groupFromPath =
      path.includes('display eq "support"') || path.includes("support")
        ? "Support"
        : path.includes('display eq "legal"') || path.includes("legal")
          ? "Legal"
          : typeof valueObj.group === "string"
            ? valueObj.group
            : undefined;

    if ((verb === "remove" || verb === "delete") && personName && groupFromPath) {
      applyRemoveFromGroup(personName, groupFromPath, actor, applied);
      continue;
    }
    if ((verb === "add" || verb === "replace") && path.includes("groups") && personName && groupFromPath) {
      applyAddToGroup(personName, groupFromPath, actor, applied);
      continue;
    }
    if (
      (verb === "replace" || verb === "add") &&
      path.includes("active") &&
      personName &&
      (value === false || valueObj.active === false)
    ) {
      applyDeactivate(personName, actor, applied);
      continue;
    }
  }
}

function applyConvenienceFlags(
  body: DirectorySyncBody,
  actor: string,
  applied: string[],
): void {
  if (body.removeJordanFromSupport) {
    applyRemoveFromGroup("Jordan Park", "Support", actor, applied);
  }
  if (body.deactivatePriya) {
    applyDeactivate("Priya Shah", actor, applied);
  }
  if (body.addJordanToLegal) {
    applyAddToGroup("Jordan Park", "Legal", actor, applied);
  }
}

export function postDirectorySync(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }

    const body = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<DirectorySyncBody>,
      catch: () => ({}),
    })) as DirectorySyncBody;

    const provider = body.provider ?? (body.Operations?.length ? "scim" : "okta-shaped");
    const actor = actorFor(provider);
    const applied: string[] = [];

    if (body.Operations?.length) {
      applyScimOperations(body.Operations, actor, applied);
    }
    applyConvenienceFlags(body, actor, applied);

    return NextResponse.json({
      ok: true,
      provider: provider === "okta-shaped" ? "okta-shaped" : "scim",
      idp: provider === "keycloak" ? "keycloak" : provider === "scim" ? "keycloak-scim" : "okta-shaped",
      applied,
    });
  });
}

/** SCIM PatchOp entry — same Effect as directory sync with provider forced to scim. */
export function postScimDirectorySync(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }

    const raw = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<DirectorySyncBody>,
      catch: () => ({}),
    })) as DirectorySyncBody;

    const body: DirectorySyncBody = {
      ...raw,
      provider: "scim",
      schemas: raw.schemas ?? ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
    };

    // Re-enter via a synthetic Request so path stays one implementation.
    const synthetic = new Request("http://local/sync/directory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return yield* postDirectorySync(synthetic);
  });
}
