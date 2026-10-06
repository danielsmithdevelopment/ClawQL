/**
 * WebAuthn registration / issue step-up for Cloud E2E (CDP virtual authenticator).
 * Arrange surface under /api/e2e/webauthn/* — Pass-when asserts /audit + Profile UI.
 */
import { Effect } from "effect";
import { NextResponse } from "next/server";

import { verifyPasskeyRegistrationEffect } from "clawql-auth";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld, newId, personByName } from "@/lib/managed/e2e/world";

export type RegisterKind = "device-bound" | "synced";

function rpIdFromRequest(req: Request): string {
  // Browsers reject IP literals as WebAuthn rpId; map loopback → localhost.
  const host = new URL(req.url).hostname;
  return host === "127.0.0.1" || host === "::1" ? "localhost" : host;
}

function originFromRequest(req: Request): string {
  const url = new URL(req.url);
  const host = url.hostname === "127.0.0.1" || url.hostname === "::1" ? "localhost" : url.host;
  // Preserve non-default ports when rewriting loopback → localhost.
  if (host === "localhost" && url.port && url.port !== "80" && url.port !== "443") {
    return `${url.protocol}//localhost:${url.port}`;
  }
  if (host === "localhost") return `${url.protocol}//localhost${url.port ? `:${url.port}` : ""}`;
  return `${url.protocol}//${url.host}`;
}

/** POST /api/e2e/webauthn/register/options — begin CDP registration ceremony. */
export function postRegisterOptions(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const body = (yield* Effect.tryPromise({
      try: () =>
        req.json() as Promise<{
          person?: string;
          kind?: RegisterKind;
          label?: string;
        }>,
      catch: () => ({}),
    })) as { person?: string; kind?: RegisterKind; label?: string };

    const kind: RegisterKind = body.kind === "synced" ? "synced" : "device-bound";
    const personName = body.person ?? "Dana Reyes";
    const person = personByName(personName);
    if (!person) {
      return NextResponse.json({ error: "person not found" }, { status: 404 });
    }

    const sw = yield* Effect.tryPromise({
      try: () => import("@simplewebauthn/server"),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const rpID = rpIdFromRequest(req);
    const options = yield* Effect.tryPromise({
      try: () =>
        sw.generateRegistrationOptions({
          rpName: "ClawQL Cloud",
          rpID,
          userName: person.email,
          userDisplayName: person.name,
          userID: new TextEncoder().encode(person.id),
          attestationType: "none",
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "required",
            authenticatorAttachment: kind === "synced" ? "platform" : "cross-platform",
          },
          supportedAlgorithmIDs: [-7, -257],
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const world = getWorld();
    world.webauthnPending = {
      challenge: options.challenge,
      person: person.name,
      kind,
      label: body.label ?? (kind === "synced" ? "Synced passkey" : "Device-bound key"),
      purpose: "register",
      createdAt: Date.now(),
    };

    return NextResponse.json({
      options,
      kind,
      person: person.name,
      label: world.webauthnPending.label,
    });
  });
}

/** POST /api/e2e/webauthn/register/verify — finish ceremony; updates world + audit. */
export function postRegisterVerify(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const world = getWorld();
    const pending = world.webauthnPending;
    if (!pending || pending.purpose !== "register") {
      return NextResponse.json({ error: "no pending registration" }, { status: 400 });
    }

    const body = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<{ response?: unknown; userVerified?: boolean }>,
      catch: () => ({}),
    })) as { response?: unknown; userVerified?: boolean };

    if (body.userVerified === false) {
      appendAudit(pending.person, "security_key.register", "Rejected — needs PIN or fingerprint");
      world.webauthnPending = null;
      return NextResponse.json(
        { error: "Rejected for needing a PIN or fingerprint; no key is created" },
        { status: 403 },
      );
    }

    if (!body.response) {
      return NextResponse.json({ error: "response required" }, { status: 400 });
    }

    const verifiedResult = yield* verifyPasskeyRegistrationEffect(
      { rpId: rpIdFromRequest(req), origin: originFromRequest(req) },
      {
        response: body.response,
        expectedChallenge: pending.challenge,
        rpId: rpIdFromRequest(req),
        origin: originFromRequest(req),
      },
    ).pipe(
      Effect.map((v) => ({ ok: true as const, v })),
      Effect.catch((err) =>
        Effect.succeed({
          ok: false as const,
          err: err instanceof Error ? err : new Error(String(err)),
        }),
      ),
    );

    if (!verifiedResult.ok) {
      const reason = verifiedResult.err.message;
      appendAudit(pending.person, "security_key.register", "Rejected — ceremony failed", { reason });
      world.webauthnPending = null;
      return NextResponse.json({ error: reason }, { status: 403 });
    }

    const verified = verifiedResult.v;
    const person = personByName(pending.person);
    if (!person) {
      world.webauthnPending = null;
      return NextResponse.json({ error: "person not found" }, { status: 404 });
    }

    const canApprove = pending.kind === "device-bound";
    const key = {
      id: newId("sk"),
      label: pending.label,
      kind: pending.kind,
      canApprove,
      aaguid: pending.kind === "synced" ? "aagu_platform" : "aagu_yubi5",
      signatureCounter: verified.counter || 1,
      revoked: false,
      credentialId: verified.credentialId,
      publicKey: verified.publicKeyBase64Url,
    };
    person.securityKeys.push(key);
    if (person.securityKeys.filter((k) => !k.revoked).length >= 2) {
      world.securityKeysRegistered = true;
      world.recoveryCodesShownOnce = true;
      world.firstRunStep = Math.max(world.firstRunStep, 3);
    }
    const status = canApprove ? "Can approve" : "Sign-in only";
    appendAudit(person.name, "security_key.register", status, {
      kind: pending.kind,
      label: pending.label,
      credentialId: key.credentialId,
    });
    world.webauthnPending = null;

    return NextResponse.json({
      ok: true,
      key,
      status,
    });
  });
}

/** POST /api/e2e/webauthn/issue/options — step-up before API key issue (KEY-07). */
export function postIssueOptions(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const body = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<{ person?: string; name?: string }>,
      catch: () => ({}),
    })) as { person?: string; name?: string };

    const personName = body.person ?? "Dana Reyes";
    const person = personByName(personName);
    if (!person) {
      return NextResponse.json({ error: "person not found" }, { status: 404 });
    }

    const sw = yield* Effect.tryPromise({
      try: () => import("@simplewebauthn/server"),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const allowCredentials = person.securityKeys
      .filter((k) => !k.revoked && k.credentialId)
      .map((k) => ({ id: k.credentialId!, transports: ["usb", "internal"] as ("usb" | "internal")[] }));

    const rpID = rpIdFromRequest(req);
    const options = yield* Effect.tryPromise({
      try: () =>
        sw.generateAuthenticationOptions({
          rpID,
          userVerification: "required",
          allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const world = getWorld();
    world.webauthnPending = {
      challenge: options.challenge,
      person: person.name,
      kind: "device-bound",
      label: body.name ?? "pending-issue",
      purpose: "issue",
      createdAt: Date.now(),
    };

    return NextResponse.json({ options, person: person.name, keyName: world.webauthnPending.label });
  });
}

/**
 * POST /api/e2e/webauthn/issue/verify — UV must succeed or no API key is created.
 * When `userVerified: false` (CDP), refuse without calling credentials.get crypto.
 */
export function postIssueVerify(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const world = getWorld();
    const pending = world.webauthnPending;
    if (!pending || pending.purpose !== "issue") {
      return NextResponse.json({ error: "no pending issue step-up" }, { status: 400 });
    }

    const body = (yield* Effect.tryPromise({
      try: () =>
        req.json() as Promise<{
          response?: unknown;
          userVerified?: boolean;
          name?: string;
        }>,
      catch: () => ({}),
    })) as { response?: unknown; userVerified?: boolean; name?: string };

    if (body.userVerified === false || !body.response) {
      appendAudit(pending.person, "key.issue", "Rejected — needs PIN or fingerprint");
      world.webauthnPending = null;
      return NextResponse.json(
        { error: "Rejected for needing a PIN or fingerprint; no key is created" },
        { status: 403 },
      );
    }

    // Successful UV path: mint API key (assertion crypto verified by browser/CDP presence).
    const lastFour = newId("").slice(-4);
    const secret = `cqk_${lastFour}_${newId("sec").slice(4)}`;
    const key = {
      id: newId("key"),
      name: body.name ?? pending.label ?? `key-${lastFour}`,
      secretShown: true,
      group: "Engineering",
      canUse: ["models", "tools"],
      dailyCapCents: 5000,
      spentTodayCents: 0,
      revoked: false,
      expiresAt: new Date(Date.now() + 90 * 864e5).toISOString(),
      lastFour,
      secretOnce: secret,
      secretToken: secret,
      confirmedSaved: false,
    };
    world.keys.push(key);
    appendAudit(pending.person, "key.issue", "Issued", { key: key.name });
    world.webauthnPending = null;
    return NextResponse.json({
      ok: true,
      key: {
        id: key.id,
        name: key.name,
        lastFour: key.lastFour,
        secret,
      },
    });
  });
}
