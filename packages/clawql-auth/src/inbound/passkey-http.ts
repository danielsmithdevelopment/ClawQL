/**
 * HTTP routes for primary passkey enroll / login (Phase 5 host surface).
 */

import type { Express, Request, Response } from "express";
import { Effect } from "effect";

import type { SecretStore } from "../stores/types.js";
import { createMcpOAuthRateLimiter, enforceMcpOAuthRateLimit } from "./oauth-rate-limit.js";
import {
  issuePasskeyEnrollChallengeEffect,
  issuePasskeyLoginChallengeEffect,
  primaryPasskeyEnrollEffect,
  primaryPasskeyLoginEffect,
  type PasskeyCredentialStore,
  type PrimaryPasskeyError,
} from "./primary-passkey.js";
import type { WebAuthnStepUpVerifier } from "../step-up/webauthn.js";
import {
  createSimpleWebAuthnVerifier,
  verifyPasskeyRegistrationEffect,
} from "../step-up/simplewebauthn-verifier.js";
import type { McpOAuthAdminAuth } from "./http.js";

export const PASSKEY_CHALLENGE_PATH = "/oauth/passkey/challenge";
export const PASSKEY_ENROLL_PATH = "/oauth/passkey/enroll";
export const PASSKEY_LOGIN_PATH = "/oauth/passkey/login";

export type AttachPasskeyRoutesOptions = {
  credentials: PasskeyCredentialStore;
  secretStore: SecretStore;
  rpId: string;
  origin: string;
  /** Defaults to SimpleWebAuthn verifier for `rpId`/`origin`. */
  verifier?: WebAuthnStepUpVerifier;
  /**
   * When set, challenge + enroll require admin auth (same as EMA admin).
   * Login stays open for already-enrolled subjects (assertion proves possession).
   */
  adminAuth?: McpOAuthAdminAuth;
};

function jsonError(res: Response, status: number, error: string, description?: string): void {
  res.status(status).json({
    error,
    ...(description ? { error_description: description } : {}),
  });
}

function reasonOf(err: unknown): string {
  if (err && typeof err === "object" && "reason" in err) {
    return String((err as PrimaryPasskeyError).reason);
  }
  return err instanceof Error ? err.message : String(err);
}

async function assertPasskeyAdmin(
  req: Request,
  res: Response,
  admin?: McpOAuthAdminAuth
): Promise<boolean> {
  if (!admin) return true;
  const key = admin.adminApiKey?.trim();
  const header = req.header("authorization") ?? "";
  if (key && header === `Bearer ${key}`) return true;
  if (admin.resolveAdminClaims) {
    const claims = await Effect.runPromise(admin.resolveAdminClaims(req));
    const role = admin.requiredRole ?? "admin";
    if (claims && (claims.role === role || claims.scope?.includes("ema:admin"))) return true;
  }
  jsonError(res, 401, "unauthorized", "admin credentials required");
  return false;
}

/**
 * Attach passkey challenge / enroll / login routes when `CLAWQL_PASSKEY_ENABLED=1`.
 */
export function attachPasskeyRoutes(app: Express, options: AttachPasskeyRoutesOptions): void {
  const rateLimit = createMcpOAuthRateLimiter();
  const verifier =
    options.verifier ??
    createSimpleWebAuthnVerifier({ rpId: options.rpId, origin: options.origin });

  app.use("/oauth/passkey", rateLimit);

  app.post(PASSKEY_CHALLENGE_PATH, (req, res) => {
    if (!enforceMcpOAuthRateLimit(req, res)) return;
    void (async () => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const purpose = String(body.purpose ?? "login");
      const subjectId = String(body.subjectId ?? body.subject_id ?? body.sub ?? "");
      if (!subjectId) {
        jsonError(res, 400, "invalid_request", "subjectId required");
        return;
      }
      if (purpose === "enroll" && !(await assertPasskeyAdmin(req, res, options.adminAuth))) {
        return;
      }
      const effect =
        purpose === "enroll"
          ? issuePasskeyEnrollChallengeEffect({
              store: options.secretStore,
              subjectId,
              rpId: options.rpId,
              origin: options.origin,
            })
          : issuePasskeyLoginChallengeEffect({
              store: options.secretStore,
              subjectId,
              rpId: options.rpId,
              origin: options.origin,
            });
      try {
        const challenge = await Effect.runPromise(effect);
        res.status(200).json(challenge);
      } catch (err) {
        jsonError(res, 400, "invalid_request", reasonOf(err));
      }
    })();
  });

  app.post(PASSKEY_ENROLL_PATH, (req, res) => {
    if (!enforceMcpOAuthRateLimit(req, res)) return;
    void (async () => {
      if (!(await assertPasskeyAdmin(req, res, options.adminAuth))) return;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const subjectId = String(body.subjectId ?? body.subject_id ?? body.sub ?? "");
      const challenge = String(body.challenge ?? "");
      const response = body.response ?? body.attestation;
      if (!subjectId || !challenge || response == null) {
        jsonError(res, 400, "invalid_request", "subjectId, challenge, and response required");
        return;
      }
      try {
        const verified = await Effect.runPromise(
          verifyPasskeyRegistrationEffect(
            { rpId: options.rpId, origin: options.origin },
            { response, expectedChallenge: challenge, rpId: options.rpId, origin: options.origin }
          )
        );
        const record = await Effect.runPromise(
          primaryPasskeyEnrollEffect({
            credentials: options.credentials,
            store: options.secretStore,
            challenge,
            enroll: {
              subjectId,
              credentialId: verified.credentialId,
              publicKeyBase64Url: verified.publicKeyBase64Url,
              counter: verified.counter,
              transports: verified.transports,
              label: typeof body.label === "string" ? body.label : undefined,
            },
          })
        );
        res.status(201).json({
          subjectId: record.subjectId,
          credentialId: record.credentialId,
          enrolledAt: record.enrolledAt,
          label: record.label,
        });
      } catch (err) {
        jsonError(res, 400, "invalid_request", reasonOf(err));
      }
    })();
  });

  app.post(PASSKEY_LOGIN_PATH, (req, res) => {
    if (!enforceMcpOAuthRateLimit(req, res)) return;
    void (async () => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const credentialId = String(body.credentialId ?? body.credential_id ?? "");
      const challenge = String(body.challenge ?? "");
      const assertion = body.assertion ?? body.response;
      if (!credentialId || !challenge || assertion == null) {
        jsonError(res, 400, "invalid_request", "credentialId, challenge, and assertion required");
        return;
      }
      try {
        const claims = await Effect.runPromise(
          primaryPasskeyLoginEffect({
            verifier,
            credentials: options.credentials,
            store: options.secretStore,
            challenge,
            login: {
              credentialId,
              assertion,
              rpId: options.rpId,
              origin: options.origin,
              role: typeof body.role === "string" ? body.role : undefined,
              scope: Array.isArray(body.scope)
                ? body.scope.filter((s): s is string => typeof s === "string")
                : undefined,
            },
          })
        );
        res.status(200).json({ claims });
      } catch (err) {
        jsonError(res, 401, "unauthorized", reasonOf(err));
      }
    })();
  });
}
