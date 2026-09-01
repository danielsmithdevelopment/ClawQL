/**
 * Phase 7 — re-auth notify contract + helpers for Hermes / Telegram hosts.
 * clawql-auth does not send Telegram messages; it builds safe payloads (URL + state only).
 */

import { Data, Effect } from "effect";

import type { ReauthRequiredError } from "./errors.js";

export type ReauthNotifyChannel = "telegram" | "slack" | "email";

export type ReauthNotifyPayload = {
  providerId: string;
  tokenKey: string;
  reason: string;
  /** PKCE / consent URL — never includes client secrets or refresh tokens. */
  reauthUrl: string;
  channel: ReauthNotifyChannel;
  /** Opaque correlation for the host (Hermes chat id, Slack user, etc.). */
  notifyTarget?: string;
};

export class ReauthNotifyError extends Data.TaggedError("ReauthNotifyError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Host-injected notifier (Hermes Telegram DM, Slack, email). */
export type ReauthNotifier = {
  notify: (payload: ReauthNotifyPayload) => Effect.Effect<void, ReauthNotifyError>;
};

export const noopReauthNotifier: ReauthNotifier = {
  notify: () => Effect.void,
};

/**
 * Build a re-auth URL for a provider (host supplies the authorization URL template).
 * Query params: `provider`, `state` only — no secrets.
 */
export function buildOAuthReauthUrlEffect(
  baseAuthorizationUrl: string,
  input: { providerId: string; state: string }
): Effect.Effect<string> {
  return Effect.sync(() => {
    const url = new URL(baseAuthorizationUrl);
    url.searchParams.set("provider", input.providerId);
    url.searchParams.set("state", input.state);
    return url.toString();
  });
}

/** Notify from a {@link ReauthRequiredError} when `reauthUrl` is present. */
export function notifyReauthRequiredEffect(
  notifier: ReauthNotifier,
  error: ReauthRequiredError,
  options: { channel: ReauthNotifyChannel; notifyTarget?: string }
): Effect.Effect<void, ReauthNotifyError> {
  if (!error.reauthUrl) {
    return Effect.fail(new ReauthNotifyError({ reason: "missing_reauth_url" }));
  }
  return notifier.notify({
    providerId: error.providerId,
    tokenKey: error.tokenKey,
    reason: error.reason,
    reauthUrl: error.reauthUrl,
    channel: options.channel,
    notifyTarget: options.notifyTarget,
  });
}
