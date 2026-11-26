/**
 * Passkey WebAuthn step-up for managed review approve (audit AA2 / BB2).
 * Challenges are one-time and bound to (userId, review id, kind, decision, changeHash).
 * Assertions are verified against enrolled public keys under $CLAWQL_HOME.
 *
 * Without FIDO MDS attestation allowlisting we call these "passkeys" — synced /
 * virtual authenticators can satisfy UV, so "device-bound" is not claimed (BB2).
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Effect } from "effect";

export type ApproveCredentialRecord = {
  readonly subjectId: string;
  readonly credentialId: string;
  readonly publicKeyBase64Url: string;
  readonly counter: number;
  readonly label?: string;
  readonly canApprove: boolean;
  readonly enrolledAt: string;
  readonly transports?: string[];
};

export type ApproveChallengeRecord = {
  readonly challenge: string;
  readonly userId: string;
  readonly reviewId: string;
  readonly kind: string;
  readonly decision: string;
  /** Parked change argsHash / source content hash (BB3). Empty when not applicable. */
  readonly changeHash: string;
  readonly expiresAtMs: number;
};

/** Default max age (seconds) of auth_time / iat for first-passkey enrollment (BB2). */
export const FIRST_PASSKEY_RECENT_AUTH_SECONDS = 300;

function clawqlHome(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.CLAWQL_HOME?.trim() ||
    env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim() ||
    join(process.env.HOME || "/tmp", ".ClawQL")
  );
}

function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(clawqlHome(env), "Dashboard", "webauthn-credentials.json");
}

function challengesDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(clawqlHome(env), "Dashboard", "approve-challenges");
}

function challengeFile(challenge: string, env: NodeJS.ProcessEnv = process.env): string {
  const hash = createHash("sha256").update(challenge).digest("hex").slice(0, 32);
  return join(challengesDir(env), `${hash}.json`);
}

function enrollmentAuditPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(clawqlHome(env), "Dashboard", "passkey-enrollments.jsonl");
}

/**
 * Recent interactive sign-in time from a JWT (CC2).
 * Prefer `auth_time`, else the latest `amr[].timestamp` (Supabase includes these on password/OAuth).
 * Do **not** fall back to `iat` — refresh reissues access tokens and would weaken first-passkey gating.
 */
export function accessTokenAuthTimeSec(accessToken: string | undefined | null): number | undefined {
  const token = accessToken?.trim();
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
      auth_time?: number;
      iat?: number;
      amr?: Array<string | { method?: string; timestamp?: number }>;
    };
    if (typeof payload.auth_time === "number" && Number.isFinite(payload.auth_time)) {
      return payload.auth_time;
    }
    let amrMax: number | undefined;
    if (Array.isArray(payload.amr)) {
      for (const entry of payload.amr) {
        if (entry && typeof entry === "object" && typeof entry.timestamp === "number") {
          const ts = entry.timestamp;
          if (!Number.isFinite(ts)) continue;
          amrMax = amrMax == null ? ts : Math.max(amrMax, ts);
        }
      }
    }
    if (amrMax != null) return amrMax;
    // Explicitly ignore iat (CC2).
    return undefined;
  } catch {
    return undefined;
  }
}

export function recentAuthSatisfied(
  authTimeSec: number | undefined,
  maxAgeSec: number = FIRST_PASSKEY_RECENT_AUTH_SECONDS,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  if (authTimeSec == null || !Number.isFinite(authTimeSec)) return false;
  return nowSec - authTimeSec <= maxAgeSec && nowSec - authTimeSec >= 0;
}

async function readCredentials(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ApproveCredentialRecord[]> {
  try {
    const raw = await readFile(credentialsPath(env), "utf8");
    const parsed = JSON.parse(raw) as { credentials?: ApproveCredentialRecord[] };
    return Array.isArray(parsed.credentials) ? parsed.credentials : [];
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw e;
  }
}

async function writeCredentials(
  credentials: ApproveCredentialRecord[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = credentialsPath(env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ credentials }, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

export function listApproveCredentialsEffect(
  subjectId: string,
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<ApproveCredentialRecord[], Error> {
  return Effect.tryPromise({
    try: async () => {
      const all = await readCredentials(env);
      return all.filter((c) => c.subjectId === subjectId && c.canApprove);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export function enrollApproveCredentialEffect(
  input: Omit<ApproveCredentialRecord, "enrolledAt" | "canApprove"> & {
    readonly canApprove?: boolean;
  },
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<ApproveCredentialRecord, Error> {
  return Effect.tryPromise({
    try: async () => {
      const all = await readCredentials(env);
      const record: ApproveCredentialRecord = {
        subjectId: input.subjectId,
        credentialId: input.credentialId,
        publicKeyBase64Url: input.publicKeyBase64Url,
        counter: input.counter,
        label: input.label,
        canApprove: input.canApprove !== false,
        enrolledAt: new Date().toISOString(),
        transports: input.transports,
      };
      const next = all.filter((c) => c.credentialId !== record.credentialId);
      next.push(record);
      await writeCredentials(next, env);
      return record;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export function updateCredentialCounterEffect(
  credentialId: string,
  counter: number,
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: async () => {
      const all = await readCredentials(env);
      const next = all.map((c) =>
        c.credentialId === credentialId ? { ...c, counter } : c,
      );
      await writeCredentials(next, env);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export type ApproveChallengeOptions = {
  readonly options: Record<string, unknown>;
  readonly challenge: string;
};

export function issueApproveChallengeEffect(input: {
  readonly userId: string;
  readonly reviewId: string;
  readonly kind: string;
  readonly decision: string;
  readonly changeHash: string;
  readonly rpId: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<ApproveChallengeOptions, Error> {
  return Effect.tryPromise({
    try: async () => {
      const env = input.env ?? process.env;
      const creds = (await readCredentials(env)).filter(
        (c) => c.subjectId === input.userId && c.canApprove,
      );
      if (creds.length === 0) {
        throw new Error("no_passkey — register a passkey before approving");
      }
      const changeHash = input.changeHash.trim();
      if (!changeHash) {
        throw new Error("approve_challenge_missing_change_hash");
      }
      const sw = await import("@simplewebauthn/server");
      const options = await sw.generateAuthenticationOptions({
        rpID: input.rpId,
        userVerification: "required",
        allowCredentials: creds.map((c) => ({
          id: c.credentialId,
          transports: (c.transports ?? ["usb", "internal"]) as (
            | "usb"
            | "nfc"
            | "ble"
            | "internal"
            | "hybrid"
          )[],
        })),
      });
      const record: ApproveChallengeRecord = {
        challenge: options.challenge,
        userId: input.userId,
        reviewId: input.reviewId,
        kind: input.kind,
        decision: input.decision,
        changeHash,
        expiresAtMs: Date.now() + 5 * 60_000,
      };
      await mkdir(challengesDir(env), { recursive: true, mode: 0o700 });
      const path = challengeFile(record.challenge, env);
      const tmp = `${path}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      await rename(tmp, path);
      return { options: options as unknown as Record<string, unknown>, challenge: options.challenge };
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export function consumeApproveChallengeEffect(input: {
  readonly challenge: string;
  readonly userId: string;
  readonly reviewId: string;
  readonly kind: string;
  readonly decision: string;
  readonly changeHash?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<ApproveChallengeRecord, Error> {
  return Effect.tryPromise({
    try: async () => {
      const env = input.env ?? process.env;
      const path = challengeFile(input.challenge, env);
      let raw: string;
      try {
        raw = await readFile(path, "utf8");
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
          throw new Error("approve_challenge_not_found_or_consumed");
        }
        throw e;
      }
      // Consume first (rename away) so concurrent verifies cannot reuse.
      const consumed = `${path}.consumed.${Date.now()}`;
      await rename(path, consumed);
      try {
        await unlink(consumed);
      } catch {
        /* best-effort */
      }
      const record = JSON.parse(raw) as ApproveChallengeRecord;
      if (record.expiresAtMs < Date.now()) {
        throw new Error("approve_challenge_expired");
      }
      if (
        record.userId !== input.userId ||
        record.reviewId !== input.reviewId ||
        record.kind !== input.kind ||
        record.decision !== input.decision
      ) {
        throw new Error("approve_challenge_binding_mismatch");
      }
      const expectedHash = (record.changeHash ?? "").trim();
      const gotHash = (input.changeHash ?? expectedHash).trim();
      if (expectedHash && gotHash !== expectedHash) {
        throw new Error("approve_challenge_change_hash_mismatch");
      }
      return record;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export function verifyApproveAssertionEffect(input: {
  readonly userId: string;
  readonly reviewId: string;
  readonly kind: string;
  readonly decision: string;
  readonly changeHash: string;
  readonly response: unknown;
  readonly rpId: string;
  readonly origin: string | string[];
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<{ readonly credentialId: string }, Error> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    const response = input.response as {
      id?: string;
      rawId?: string;
      response?: { clientDataJSON?: string };
    };
    const credentialId = String(response.id ?? response.rawId ?? "").trim();
    if (!credentialId) {
      return yield* Effect.fail(new Error("webauthn_response_missing_id"));
    }

    // Extract challenge from clientDataJSON before consume (need the challenge string).
    const clientDataB64 = response.response?.clientDataJSON;
    if (!clientDataB64 || typeof clientDataB64 !== "string") {
      return yield* Effect.fail(new Error("webauthn_client_data_missing"));
    }
    const clientData = JSON.parse(
      Buffer.from(clientDataB64, "base64url").toString("utf8"),
    ) as { challenge?: string };
    const challenge = clientData.challenge?.trim();
    if (!challenge) {
      return yield* Effect.fail(new Error("webauthn_challenge_missing"));
    }

    yield* consumeApproveChallengeEffect({
      challenge,
      userId: input.userId,
      reviewId: input.reviewId,
      kind: input.kind,
      decision: input.decision,
      changeHash: input.changeHash,
      env,
    });

    const creds = yield* listApproveCredentialsEffect(input.userId, env);
    const cred = creds.find((c) => c.credentialId === credentialId);
    if (!cred) {
      return yield* Effect.fail(new Error("webauthn_credential_not_registered_for_approver"));
    }

    const { createSimpleWebAuthnVerifier, publicKeyFromPasskeyRecord } = yield* Effect.tryPromise({
      try: () => import("clawql-auth/step-up"),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const verifier = createSimpleWebAuthnVerifier({
      rpId: input.rpId,
      origin: input.origin,
    });

    const result = yield* Effect.tryPromise({
      try: () =>
        verifier.verifyAssertion({
          assertion: input.response,
          expectedChallenge: challenge,
          rpId: input.rpId,
          credential: {
            id: cred.credentialId,
            publicKey: publicKeyFromPasskeyRecord(cred.publicKeyBase64Url),
            counter: cred.counter,
            transports: cred.transports,
          },
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    if (typeof result.newCounter === "number") {
      yield* updateCredentialCounterEffect(cred.credentialId, result.newCounter, env);
    }
    return { credentialId: cred.credentialId };
  });
}

/** Authentication challenge proving possession of an already-enrolled passkey (BB2). */
export function issueEnrollGateChallengeEffect(input: {
  readonly userId: string;
  readonly rpId: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<ApproveChallengeOptions, Error> {
  return issueApproveChallengeEffect({
    userId: input.userId,
    reviewId: "__enroll_gate__",
    kind: "enroll_gate",
    decision: "enroll_gate",
    changeHash: "enroll_gate",
    rpId: input.rpId,
    env: input.env,
  });
}

export function issueEnrollChallengeEffect(input: {
  readonly userId: string;
  readonly userName: string;
  readonly displayName: string;
  readonly rpId: string;
  readonly rpName?: string;
  /** Required when the user already has passkeys (BB2). */
  readonly gateResponse?: unknown;
  readonly origin?: string | string[];
  /** Required for first passkey: recent auth_time / iat (BB2). */
  readonly authTimeSec?: number;
  readonly firstKeyMaxAgeSec?: number;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<
  { readonly options: Record<string, unknown>; readonly challenge: string; readonly firstKey: boolean },
  Error
> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    const existing = yield* Effect.tryPromise({
      try: async () => (await readCredentials(env)).filter((c) => c.subjectId === input.userId),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const firstKey = existing.length === 0;

    if (!firstKey) {
      if (input.gateResponse == null || !input.origin) {
        return yield* Effect.fail(
          new Error(
            "existing_passkey_required — prove an enrolled passkey (enroll_gate_challenge) before adding another",
          ),
        );
      }
      yield* verifyApproveAssertionEffect({
        userId: input.userId,
        reviewId: "__enroll_gate__",
        kind: "enroll_gate",
        decision: "enroll_gate",
        changeHash: "enroll_gate",
        response: input.gateResponse,
        rpId: input.rpId,
        origin: input.origin,
        env,
      });
    } else if (
      !recentAuthSatisfied(input.authTimeSec, input.firstKeyMaxAgeSec ?? FIRST_PASSKEY_RECENT_AUTH_SECONDS)
    ) {
      return yield* Effect.fail(
        new Error(
          "recent_sign_in_required — sign in again before enrolling your first passkey",
        ),
      );
    }

    const issued = yield* Effect.tryPromise({
      try: async () => {
        const sw = await import("@simplewebauthn/server");
        const options = await sw.generateRegistrationOptions({
          rpName: input.rpName ?? "ClawQL",
          rpID: input.rpId,
          userName: input.userName,
          userDisplayName: input.displayName,
          userID: new TextEncoder().encode(input.userId),
          attestationType: "none",
          excludeCredentials: existing.map((c) => ({
            id: c.credentialId,
            transports: (c.transports ?? ["internal", "usb"]) as (
              | "usb"
              | "nfc"
              | "ble"
              | "internal"
              | "hybrid"
            )[],
          })),
          authenticatorSelection: {
            authenticatorAttachment: "cross-platform",
            residentKey: "preferred",
            userVerification: "required",
          },
        });
        const record: ApproveChallengeRecord = {
          challenge: options.challenge,
          userId: input.userId,
          reviewId: "__enroll__",
          kind: "enroll",
          decision: "enroll",
          changeHash: firstKey ? "enroll_first" : "enroll_additional",
          expiresAtMs: Date.now() + 5 * 60_000,
        };
        await mkdir(challengesDir(env), { recursive: true, mode: 0o700 });
        const path = challengeFile(record.challenge, env);
        const tmp = `${path}.${process.pid}.tmp`;
        await writeFile(tmp, `${JSON.stringify(record)}\n`, { mode: 0o600 });
        await rename(tmp, path);
        return {
          options: options as unknown as Record<string, unknown>,
          challenge: options.challenge,
        };
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    return { ...issued, firstKey };
  });
}

export type PasskeyEnrollmentAudit = {
  readonly at: string;
  readonly userId: string;
  readonly email: string;
  readonly orgId: string;
  readonly credentialId: string;
  readonly label: string;
  readonly firstKey: boolean;
};

export function recordPasskeyEnrollmentEffect(
  event: PasskeyEnrollmentAudit,
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: async () => {
      const path = enrollmentAuditPath(env);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await appendFile(path, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

let passkeyNotifyWarnLogged = false;

/** CC3: warn once when production enrollments have no outbound notify URL. */
export function warnIfPasskeyEnrollNotifyUnset(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (passkeyNotifyWarnLogged) return;
  if ((env.NODE_ENV ?? "") !== "production") return;
  if (env.CLAWQL_E2E_HARNESS === "1") return;
  if (env.CLAWQL_PASSKEY_ENROLL_NOTIFY_URL?.trim()) return;
  passkeyNotifyWarnLogged = true;
  console.warn(
    "[clawql-dashboard] CLAWQL_PASSKEY_ENROLL_NOTIFY_URL is unset — passkey enrollments are recorded locally and in the managed audit feed but not emailed. Set the URL (and optional CLAWQL_ORG_ADMIN_NOTIFY_EMAILS) for outbound notices.",
  );
}

/**
 * Notify the enrollee + configured org-admin addresses (BB2 / CC3).
 * Always records to jsonl + managed audit feed; POSTs to CLAWQL_PASSKEY_ENROLL_NOTIFY_URL when set.
 */
export function notifyPasskeyEnrollmentEffect(
  event: PasskeyEnrollmentAudit,
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<{ readonly notified: boolean }, Error> {
  return Effect.gen(function* () {
    warnIfPasskeyEnrollNotifyUnset(env);
    yield* recordPasskeyEnrollmentEffect(event, env);

    const { appendManagedAuditRuntimeEffect } = yield* Effect.tryPromise({
      try: () => import("@/lib/managed/live/impersonation"),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    yield* appendManagedAuditRuntimeEffect({
      actor: event.email || event.userId,
      action: "passkey.enroll",
      outcome: event.firstKey
        ? `First passkey enrolled (${event.label})`
        : `Additional passkey enrolled (${event.label})`,
      tone: "ok",
    });

    const webhook = env.CLAWQL_PASSKEY_ENROLL_NOTIFY_URL?.trim();
    const adminEmails = (env.CLAWQL_ORG_ADMIN_NOTIFY_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!webhook) {
      return { notified: false };
    }
    yield* Effect.tryPromise({
      try: async () => {
        const res = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "passkey_enrollment",
            channel: "email",
            ...event,
            notifyEmails: [event.email, ...adminEmails],
            wording:
              "Passkey enrolled (no FIDO attestation allowlist — not claimed device-bound)",
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          throw new Error(`passkey_enroll_notify_http_${res.status}`);
        }
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    return { notified: true };
  });
}

export function verifyEnrollResponseEffect(input: {
  readonly userId: string;
  readonly email: string;
  readonly orgId: string;
  readonly response: unknown;
  readonly rpId: string;
  readonly origin: string | string[];
  readonly label?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<ApproveCredentialRecord, Error> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    const response = input.response as { response?: { clientDataJSON?: string } };
    const clientDataB64 = response.response?.clientDataJSON;
    if (!clientDataB64 || typeof clientDataB64 !== "string") {
      return yield* Effect.fail(new Error("webauthn_client_data_missing"));
    }
    const clientData = JSON.parse(
      Buffer.from(clientDataB64, "base64url").toString("utf8"),
    ) as { challenge?: string };
    const challenge = clientData.challenge?.trim();
    if (!challenge) {
      return yield* Effect.fail(new Error("webauthn_challenge_missing"));
    }

    const prior = yield* Effect.tryPromise({
      try: async () => (await readCredentials(env)).filter((c) => c.subjectId === input.userId),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const firstKey = prior.length === 0;

    yield* consumeApproveChallengeEffect({
      challenge,
      userId: input.userId,
      reviewId: "__enroll__",
      kind: "enroll",
      decision: "enroll",
      changeHash: firstKey ? "enroll_first" : "enroll_additional",
      env,
    });

    const { verifyPasskeyRegistrationEffect } = yield* Effect.tryPromise({
      try: () => import("clawql-auth/step-up"),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const verified = yield* verifyPasskeyRegistrationEffect(
      { rpId: input.rpId, origin: input.origin },
      {
        response: input.response,
        expectedChallenge: challenge,
        rpId: input.rpId,
        origin: input.origin,
      },
    );

    const record = yield* enrollApproveCredentialEffect(
      {
        subjectId: input.userId,
        credentialId: verified.credentialId,
        publicKeyBase64Url: verified.publicKeyBase64Url,
        counter: verified.counter,
        label: input.label ?? "Passkey",
        canApprove: true,
        transports: verified.transports,
      },
      env,
    );

    yield* notifyPasskeyEnrollmentEffect(
      {
        at: record.enrolledAt,
        userId: input.userId,
        email: input.email,
        orgId: input.orgId,
        credentialId: record.credentialId,
        label: record.label ?? "Passkey",
        firstKey,
      },
      env,
    ).pipe(Effect.catch(() => Effect.void));

    return record;
  });
}

function fixtureReviewChangeHash(reviewId: string, kind: string): string {
  return createHash("sha256").update(`${kind}:${reviewId}:fixture`).digest("hex");
}

/** Resolve the change hash for a parked review item (BB3). */
export function resolveReviewChangeHashEffect(input: {
  readonly reviewId: string;
  readonly kind: "change" | "source";
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    const home = env.CLAWQL_HOME?.trim() || undefined;
    const allowFixtureHash =
      env.CLAWQL_E2E_HARNESS === "1" ||
      (env.CLAWQL_MANAGED_DATA_SOURCE ?? "").trim().toLowerCase() === "fixture";

    if (input.kind === "change") {
      const { loadPendingExecution } = yield* Effect.tryPromise({
        try: () => import("clawql-api"),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      });
      const record = yield* Effect.tryPromise({
        try: () => loadPendingExecution(input.reviewId, home),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      });
      if (record?.argsHash) return record.argsHash;
      if (allowFixtureHash) return fixtureReviewChangeHash(input.reviewId, input.kind);
      return yield* Effect.fail(new Error("review_change_hash_unavailable"));
    }
    const { readPendingSourceEffect } = yield* Effect.tryPromise({
      try: () => import("clawql-api/sources"),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const source = yield* readPendingSourceEffect(input.reviewId, home);
    if (!source) {
      if (allowFixtureHash) return fixtureReviewChangeHash(input.reviewId, input.kind);
      return yield* Effect.fail(new Error("review_change_hash_unavailable"));
    }
    return createHash("sha256")
      .update(
        JSON.stringify({
          proposalId: source.proposalId,
          entry: source.entry,
          createdAt: source.createdAt,
          sampleOperations: source.sampleOperations,
        }),
      )
      .digest("hex");
  });
}

export function rpIdFromRequest(req: Request): string {
  const host = (req.headers.get("host") ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  const hostname = host.replace(/:\d+$/, "");
  if (!hostname || hostname === "127.0.0.1") return "localhost";
  return hostname;
}

export function originFromRequest(req: Request): string {
  const proto = (req.headers.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  const host = (req.headers.get("host") ?? "localhost").split(",")[0]?.trim() || "localhost";
  return `${proto}://${host}`;
}

/** Test helper: mint a random credential id placeholder (not a real key). */
export function randomCredentialIdForTests(): string {
  return randomBytes(16).toString("base64url");
}
