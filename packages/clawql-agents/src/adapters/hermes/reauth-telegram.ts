/**
 * Phase 7 host wiring — Telegram DM {@link ReauthNotifier} for Hermes personal stack.
 * Never puts refresh tokens or client secrets in the message — URL + state only.
 */

import {
  ReauthNotifyError,
  type ReauthNotifier,
  type ReauthNotifyPayload,
} from "clawql-auth";
import { Effect } from "effect";

export type TelegramReauthNotifierOptions = {
  botToken: string;
  /** Default chat id when payload.notifyTarget is unset (YOUR_TELEGRAM_USER_ID). */
  defaultChatId: string;
  /** Override Telegram Bot API base (tests). */
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

function formatReauthMessage(payload: ReauthNotifyPayload): string {
  return [
    `ClawQL re-auth required: ${payload.providerId}`,
    `Reason: ${payload.reason}`,
    `Open: ${payload.reauthUrl}`,
  ].join("\n");
}

/**
 * Send re-auth links via Telegram Bot API `sendMessage`.
 * Env helper: {@link createTelegramReauthNotifierFromEnv}.
 */
export function createTelegramReauthNotifier(
  options: TelegramReauthNotifierOptions
): ReauthNotifier {
  const apiBase = (options.apiBaseUrl ?? "https://api.telegram.org").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    notify: (payload) =>
      Effect.gen(function* () {
        const chatId = payload.notifyTarget?.trim() || options.defaultChatId.trim();
        if (!chatId) {
          return yield* Effect.fail(new ReauthNotifyError({ reason: "missing_chat_id" }));
        }
        if (!options.botToken.trim()) {
          return yield* Effect.fail(new ReauthNotifyError({ reason: "missing_bot_token" }));
        }

        const url = `${apiBase}/bot${options.botToken}/sendMessage`;
        const body = {
          chat_id: chatId,
          text: formatReauthMessage(payload),
          disable_web_page_preview: true,
        };

        const response = yield* Effect.tryPromise({
          try: () =>
            fetchImpl(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }),
          catch: (cause) =>
            new ReauthNotifyError({
              reason: cause instanceof Error ? cause.message : "telegram_fetch_failed",
              cause,
            }),
        });

        if (!response.ok) {
          const detail = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: () => "",
          }).pipe(Effect.catchAll(() => Effect.succeed("")));
          return yield* Effect.fail(
            new ReauthNotifyError({
              reason: `telegram_http_${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
            })
          );
        }
      }),
  };
}

/** Build from `TELEGRAM_BOT_TOKEN` + `YOUR_TELEGRAM_USER_ID` (Hermes personal stack). */
export function createTelegramReauthNotifierFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<TelegramReauthNotifierOptions>
): ReauthNotifier | null {
  const botToken = overrides?.botToken ?? env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const defaultChatId =
    overrides?.defaultChatId ??
    env.YOUR_TELEGRAM_USER_ID?.trim() ??
    env.TELEGRAM_CHAT_ID?.trim() ??
    "";
  if (!botToken || !defaultChatId) return null;
  return createTelegramReauthNotifier({
    botToken,
    defaultChatId,
    apiBaseUrl: overrides?.apiBaseUrl,
    fetchImpl: overrides?.fetchImpl,
  });
}
