/**
 * Device-bound WebAuthn step-up for managed review approve (audit AA2).
 * Challenges are one-time and bound to (userId, review id, kind, decision).
 * Assertions are verified against enrolled public keys under $CLAWQL_HOME.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
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
  readonly expiresAtMs: number;
};

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
        throw new Error(
          "no_device_bound_security_key — register a device-bound key before approving",
        );
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

export function issueEnrollChallengeEffect(input: {
  readonly userId: string;
  readonly userName: string;
  readonly displayName: string;
  readonly rpId: string;
  readonly rpName?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<{ readonly options: Record<string, unknown>; readonly challenge: string }, Error> {
  return Effect.tryPromise({
    try: async () => {
      const env = input.env ?? process.env;
      const sw = await import("@simplewebauthn/server");
      const existing = (await readCredentials(env)).filter((c) => c.subjectId === input.userId);
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

export function verifyEnrollResponseEffect(input: {
  readonly userId: string;
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

    yield* consumeApproveChallengeEffect({
      challenge,
      userId: input.userId,
      reviewId: "__enroll__",
      kind: "enroll",
      decision: "enroll",
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

    return yield* enrollApproveCredentialEffect(
      {
        subjectId: input.userId,
        credentialId: verified.credentialId,
        publicKeyBase64Url: verified.publicKeyBase64Url,
        counter: verified.counter,
        label: input.label ?? "Device-bound security key",
        canApprove: true,
        transports: verified.transports,
      },
      env,
    );
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
