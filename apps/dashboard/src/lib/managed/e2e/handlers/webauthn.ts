/**
 * WebAuthn registration / issue step-up for Cloud E2E (CDP virtual authenticator).
 * Arrange surface under /api/e2e/webauthn/* — Pass-when asserts /audit + Profile UI.
 */
import { Effect } from "effect";
import { NextResponse } from "next/server";

import {
  createSimpleWebAuthnVerifier,
  publicKeyFromPasskeyRecord,
  verifyPasskeyRegistrationEffect,
} from "clawql-auth";

import { E2eHarness } from "@/lib/managed/e2e/service";
import {
  appendAudit,
  getWorld,
  newId,
  personByName,
  recountReviewBadges,
} from "@/lib/managed/e2e/world";

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
      // Mirror /api/e2e/keys register — codes shown once when the two-key rule is met.
      recoveryCodes: world.recoveryCodesShownOnce ? world.recoveryCodes : undefined,
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

/** POST /api/e2e/webauthn/approve/options — assertion step-up for review approve (KEY-11). */
export function postApproveOptions(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const body = (yield* Effect.tryPromise({
      try: () =>
        req.json() as Promise<{ person?: string; requestId?: string }>,
      catch: () => ({}),
    })) as { person?: string; requestId?: string };

    if (!body.requestId) {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }
    const personName = body.person ?? "Dana Reyes";
    const person = personByName(personName);
    if (!person) {
      return NextResponse.json({ error: "person not found" }, { status: 404 });
    }
    if (!person.active) {
      appendAudit(person.name, "review.approve", "Refused — person deactivated");
      return NextResponse.json({ error: "person deactivated" }, { status: 403 });
    }

    const allowCredentials = person.securityKeys
      .filter((k) => !k.revoked && k.canApprove && k.credentialId && k.publicKey)
      .map((k) => ({
        id: k.credentialId!,
        transports: ["usb", "internal"] as ("usb" | "internal")[],
      }));
    if (allowCredentials.length === 0) {
      return NextResponse.json(
        { error: "no CDP-registered device-bound key — register via webauthn first" },
        { status: 400 },
      );
    }

    const sw = yield* Effect.tryPromise({
      try: () => import("@simplewebauthn/server"),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const rpID = rpIdFromRequest(req);
    const options = yield* Effect.tryPromise({
      try: () =>
        sw.generateAuthenticationOptions({
          rpID,
          userVerification: "required",
          allowCredentials,
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const world = getWorld();
    world.webauthnPending = {
      challenge: options.challenge,
      person: person.name,
      kind: "device-bound",
      label: "approve",
      purpose: "approve",
      createdAt: Date.now(),
      requestId: body.requestId,
    };
    return NextResponse.json({ options, person: person.name, requestId: body.requestId });
  });
}

/**
 * POST /api/e2e/webauthn/approve/verify — verify assertion; counter regression → clone.
 * Completes the review mandate on success (same outcomes as /api/e2e/review/approve).
 */
export function postApproveVerify(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const world = getWorld();
    const pending = world.webauthnPending;
    if (!pending || pending.purpose !== "approve" || !pending.requestId) {
      return NextResponse.json({ error: "no pending approve step-up" }, { status: 400 });
    }

    const body = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<{ response?: unknown }>,
      catch: () => ({}),
    })) as { response?: unknown };

    if (!body.response) {
      world.webauthnPending = null;
      return NextResponse.json({ error: "response required" }, { status: 400 });
    }

    const assertionJson = body.response as {
      response?: { signature?: string };
    };
    const signedPayload = assertionJson.response?.signature;
    if (signedPayload && world.usedApprovalPayloads.has(signedPayload)) {
      appendAudit(pending.person, "review.approve", "Replay rejected — no second mandate");
      world.webauthnPending = null;
      return NextResponse.json({ error: "replay rejected" }, { status: 403 });
    }

    const person = personByName(pending.person);
    const sk = person?.securityKeys.find(
      (k) => !k.revoked && k.canApprove && k.credentialId && k.publicKey,
    );
    if (!person || !sk?.credentialId || !sk.publicKey) {
      world.webauthnPending = null;
      return NextResponse.json({ error: "no matching security key" }, { status: 400 });
    }

    if (sk.aaguid && !world.allowedAuthenticatorAaguids.includes(sk.aaguid)) {
      appendAudit(pending.person, "review.approve", "Approval refused — authenticator not allowed", {
        aaguid: sk.aaguid,
      });
      world.webauthnPending = null;
      return NextResponse.json({ error: "authenticator model not allowed" }, { status: 403 });
    }

    const verifier = createSimpleWebAuthnVerifier({
      rpId: rpIdFromRequest(req),
      origin: originFromRequest(req),
    });

    const verifiedResult = yield* Effect.tryPromise({
      try: () =>
        verifier.verifyAssertion({
          assertion: body.response,
          expectedChallenge: pending.challenge,
          rpId: rpIdFromRequest(req),
          credential: {
            id: sk.credentialId!,
            publicKey: publicKeyFromPasskeyRecord(sk.publicKey!),
            counter: sk.signatureCounter,
          },
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    }).pipe(
      Effect.map((v) => ({ ok: true as const, v })),
      Effect.catch((err) =>
        Effect.succeed({
          ok: false as const,
          err: err instanceof Error ? err : new Error(String(err)),
        }),
      ),
    );

    if (!verifiedResult.ok) {
      const msg = verifiedResult.err.message;
      const clone =
        /counter|clone|unexpected/i.test(msg) ||
        msg.includes("webauthn_assertion_not_verified");
      if (clone) {
        appendAudit(pending.person, "security_key.clone", "Possible cloned key", {
          expected: sk.signatureCounter,
          reason: msg,
        });
        world.webauthnPending = null;
        return NextResponse.json({ error: "possible cloned key" }, { status: 403 });
      }
      appendAudit(pending.person, "review.approve", "Rejected — ceremony failed", { reason: msg });
      world.webauthnPending = null;
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    const newCounter = verifiedResult.v.newCounter ?? sk.signatureCounter + 1;
    if (newCounter < sk.signatureCounter) {
      appendAudit(pending.person, "security_key.clone", "Possible cloned key", {
        expected: sk.signatureCounter,
        got: newCounter,
      });
      world.webauthnPending = null;
      return NextResponse.json({ error: "possible cloned key" }, { status: 403 });
    }
    sk.signatureCounter = newCounter;
    if (signedPayload) world.usedApprovalPayloads.add(signedPayload);

    const item = world.review.find((r) => r.id === pending.requestId);
    if (!item || (item.status !== "waiting" && item.status !== "changed")) {
      world.webauthnPending = null;
      return NextResponse.json({ error: "request not approvable" }, { status: 409 });
    }

    const required = item.requiredApprovals ?? world.requiredApprovalsDefault;
    if (!item.approvers.includes(pending.person)) {
      item.approvers = [...item.approvers, pending.person];
    }
    if (item.approvers.length < required) {
      appendAudit(pending.person, "review.approve", "Partial approval", {
        requestId: item.id,
        have: item.approvers.length,
        need: required,
      });
      world.webauthnPending = null;
      return NextResponse.json({
        ok: true,
        status: "waiting",
        partial: true,
        signatureCounter: sk.signatureCounter,
      });
    }

    const mandateId = newId("man");
    item.status = "approved";
    item.mandateId = mandateId;
    if (item.kind === "change" && item.args.contract === "northwind") {
      const crm = world.crm.northwind;
      if (crm && typeof item.args.annualValue === "number") {
        crm.annualValue = item.args.annualValue as number;
      }
    }
    appendAudit(pending.person, "review.approve", "Mandate issued", {
      requestId: item.id,
      mandateId,
      signatureCounter: sk.signatureCounter,
    });
    recountReviewBadges();
    world.webauthnPending = null;
    return NextResponse.json({
      ok: true,
      status: "approved",
      mandateId,
      signatureCounter: sk.signatureCounter,
    });
  });
}
