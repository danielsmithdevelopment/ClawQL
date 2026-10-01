import { randomBytes } from "node:crypto";
import { Effect } from "effect";
import { Webhook } from "standardwebhooks";
import { CallbackEndpointError } from "./errors.js";
import { constantTimeEqualString } from "./screen.js";
import type { DeliverableEvent, DeliveryOutcome, StoredSubscription } from "./types.js";
import { webhookPostJson, type WebhookFetch } from "./webhook-fetch.js";

export const MAX_EVENT_BODY_BYTES = 256 * 1024;

export type VerificationCache = {
  has: (principal: string, url: string) => boolean;
  set: (principal: string, url: string) => void;
};

export function createVerificationCache(ttlMs = 15 * 60_000): VerificationCache {
  const map = new Map<string, number>();
  const key = (principal: string, url: string) => `${principal}\0${url}`;
  return {
    has: (principal, url) => {
      const k = key(principal, url);
      const exp = map.get(k);
      if (exp == null) return false;
      if (Date.now() > exp) {
        map.delete(k);
        return false;
      }
      return true;
    },
    set: (principal, url) => {
      map.set(key(principal, url), Date.now() + ttlMs);
    },
  };
}

function signBody(secret: string, msgId: string, signedAt: Date, body: string): string {
  const signer = new Webhook(secret);
  return signer.sign(msgId, signedAt, body);
}

function dualSign(
  primary: string,
  previous: string | undefined,
  msgId: string,
  signedAt: Date,
  body: string
): string {
  const a = signBody(primary, msgId, signedAt, body);
  if (!previous) return a;
  const b = signBody(previous, msgId, signedAt, body);
  return `${a} ${b}`;
}

export function verifyCallbackChallenge(
  sub: Pick<StoredSubscription, "id" | "url" | "secret" | "principal">,
  webhookFetch: WebhookFetch,
  cache: VerificationCache
): Effect.Effect<void, CallbackEndpointError> {
  return Effect.gen(function* () {
    if (cache.has(sub.principal, sub.url)) return;

    const challenge = randomBytes(24).toString("base64url");
    const bodyObj = { type: "verification", challenge };
    const body = JSON.stringify(bodyObj);
    const msgId = `msg_verification_${randomBytes(8).toString("hex")}`;
    const signedAt = new Date();
    const signature = signBody(sub.secret, msgId, signedAt, body);

    const result = yield* webhookPostJson(
      webhookFetch,
      sub.url,
      {
        "webhook-id": msgId,
        "webhook-timestamp": String(Math.floor(signedAt.getTime() / 1000)),
        "webhook-signature": signature,
        "X-MCP-Subscription-Id": sub.id,
      },
      body
    );

    if (!result.ok) {
      return yield* Effect.fail(
        new CallbackEndpointError({
          message: `Callback challenge HTTP ${result.status}`,
          reason: "challenge_failed",
        })
      );
    }

    let echoed: string | undefined;
    try {
      const parsed = JSON.parse(result.text) as { challenge?: unknown };
      echoed = typeof parsed.challenge === "string" ? parsed.challenge : undefined;
    } catch {
      echoed = undefined;
    }
    if (echoed == null || !constantTimeEqualString(echoed, challenge)) {
      return yield* Effect.fail(
        new CallbackEndpointError({
          message: "Callback challenge mismatch",
          reason: "challenge_failed",
        })
      );
    }

    cache.set(sub.principal, sub.url);
  });
}

export function sendSignedEvent(
  subscription: StoredSubscription,
  event: DeliverableEvent,
  webhookFetch: WebhookFetch,
  opts?: { maxAttempts?: number; baseDelayMs?: number }
): Effect.Effect<DeliveryOutcome, never> {
  return Effect.gen(function* () {
    const body = JSON.stringify({
      eventId: event.eventId,
      name: event.name,
      timestamp: event.timestamp,
      data: event.data,
      cursor: event.cursor ?? null,
    });
    if (Buffer.byteLength(body, "utf8") > MAX_EVENT_BODY_BYTES) {
      return {
        accepted: false,
        status: 413,
        attempts: 0,
        stopped: true,
        reason: "payload_too_large",
      };
    }

    const maxAttempts = opts?.maxAttempts ?? 5;
    const baseDelayMs = opts?.baseDelayMs ?? 200;
    let lastStatus = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const signedAt = new Date();
      const previousOk =
        subscription.previousSecret &&
        subscription.previousSecretExpiresAt &&
        Date.parse(subscription.previousSecretExpiresAt) > Date.now()
          ? subscription.previousSecret
          : undefined;
      const signature = dualSign(subscription.secret, previousOk, event.eventId, signedAt, body);

      const result = yield* webhookPostJson(
        webhookFetch,
        subscription.url,
        {
          "webhook-id": event.eventId,
          "webhook-timestamp": String(Math.floor(signedAt.getTime() / 1000)),
          "webhook-signature": signature,
          "X-MCP-Subscription-Id": subscription.id,
        },
        body
      ).pipe(
        Effect.catchAll((err) =>
          Effect.succeed({
            ok: false,
            status: 0,
            text: err.message,
          })
        )
      );

      lastStatus = result.status;
      if (result.ok) {
        return { accepted: true, status: result.status, attempts: attempt, stopped: false };
      }
      if (result.status === 410 || result.status === 413) {
        return {
          accepted: false,
          status: result.status,
          attempts: attempt,
          stopped: true,
          reason: result.status === 410 ? "gone" : "payload_too_large",
        };
      }
      if (attempt < maxAttempts) {
        yield* Effect.sleep(`${baseDelayMs * 2 ** (attempt - 1)} millis` as `${number} millis`);
      }
    }

    return {
      accepted: false,
      status: lastStatus,
      attempts: maxAttempts,
      stopped: false,
      reason: "retries_exhausted",
    };
  });
}
