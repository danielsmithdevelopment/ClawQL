/**
 * Host helpers: outbound OAuth token store + Hermes Telegram re-auth notify.
 */

import {
  buildOAuthReauthUrlEffect,
  createOAuthTokenStore,
  notifyReauthRequiredEffect,
  type OAuthTokenStore,
  type OAuthTokenStoreOptions,
  type ReauthRequiredError,
} from "clawql-auth";
import { createTelegramReauthNotifierFromEnv } from "clawql-agents";
import { Effect } from "effect";

export function createTelegramOnReauthRequired(
  env: NodeJS.ProcessEnv = process.env
): ((error: ReauthRequiredError) => Effect.Effect<void>) | undefined {
  if (env.CLAWQL_OUTBOUND_REAUTH_NOTIFY?.trim() === "0") {
    return undefined;
  }
  const notifier = createTelegramReauthNotifierFromEnv(env);
  if (!notifier) return undefined;
  return (error) =>
    notifyReauthRequiredEffect(notifier, error, {
      channel: "telegram",
      notifyTarget: env.YOUR_TELEGRAM_USER_ID?.trim() || env.TELEGRAM_CHAT_ID?.trim(),
    }).pipe(Effect.catchAll(() => Effect.void));
}

/**
 * Create an outbound {@link OAuthTokenStore} with optional Telegram re-auth notify
 * and `CLAWQL_OAUTH_REAUTH_BASE_URL` for PKCE/consent links.
 */
export function createHostOutboundOAuthTokenStore(
  options: OAuthTokenStoreOptions,
  env: NodeJS.ProcessEnv = process.env
): OAuthTokenStore {
  const baseUrl = env.CLAWQL_OAUTH_REAUTH_BASE_URL?.trim();
  const onReauthRequired = options.onReauthRequired ?? createTelegramOnReauthRequired(env);
  const buildReauthUrl =
    options.buildReauthUrl ??
    (baseUrl
      ? (input: {
          providerId: string;
          tokenKey: string;
          reason: "no_token" | "invalid_grant" | "refresh_failed";
        }) =>
          buildOAuthReauthUrlEffect(baseUrl, {
            providerId: input.providerId,
            state: input.tokenKey,
          }).pipe(Effect.map((url) => url as string | undefined))
      : undefined);

  return createOAuthTokenStore({
    ...options,
    buildReauthUrl,
    onReauthRequired,
  });
}
