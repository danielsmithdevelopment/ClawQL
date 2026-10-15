/**
 * Copy sensitive strings (API key secrets) with a short lifetime.
 *
 * Ideal iOS posture is UIPasteboard localOnly + expirationDate (no Universal
 * Clipboard sync). expo-clipboard 57 does not expose those options yet, so we:
 * 1. Prefer a native bridge when present (`globalThis.__CLAWQL_SECURE_CLIPBOARD__`)
 * 2. Otherwise copy via expo-clipboard and auto-clear after TTL when the
 *    pasteboard still matches what we wrote
 */
import * as Clipboard from "expo-clipboard";
import { Effect } from "effect";
import { Platform } from "react-native";

const DEFAULT_TTL_MS = 60_000;

let clearTimer: ReturnType<typeof setTimeout> | null = null;
let lastCopied: string | null = null;

export type CopySecretOptions = {
  readonly ttlMs?: number;
};

export type SecureClipboardNative = {
  readonly setSecret: (text: string, ttlMs: number) => Promise<boolean>;
};

declare global {
  // eslint-disable-next-line no-var
  var __CLAWQL_SECURE_CLIPBOARD__: SecureClipboardNative | undefined;
}

/**
 * Copies `text` to the pasteboard and clears it after `ttlMs` (default 60s)
 * when the pasteboard still matches what we wrote. Uses localOnly+expiry when
 * a native bridge is installed.
 */
export function copySecretEffect(
  text: string,
  options?: CopySecretOptions
): Effect.Effect<{
  copied: boolean;
  clearedAfterMs: number;
  localOnly: boolean;
}> {
  return Effect.gen(function* () {
    const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    const native = globalThis.__CLAWQL_SECURE_CLIPBOARD__;

    if (native) {
      const ok = yield* Effect.tryPromise({
        try: () => native.setSecret(text, ttlMs),
        catch: () => false,
      }).pipe(Effect.catch(() => Effect.succeed(false)));
      return { copied: ok, clearedAfterMs: ok ? ttlMs : 0, localOnly: ok };
    }

    const ok = yield* Effect.tryPromise({
      try: async () => {
        if (Platform.OS === "web") {
          const nav = globalThis.navigator as Navigator | undefined;
          if (!nav?.clipboard?.writeText) return false;
          await nav.clipboard.writeText(text);
          return true;
        }
        await Clipboard.setStringAsync(text);
        return true;
      },
      catch: () => false,
    }).pipe(Effect.catch(() => Effect.succeed(false)));

    if (!ok) return { copied: false, clearedAfterMs: 0, localOnly: false };

    lastCopied = text;
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      void (async () => {
        try {
          const current = await Clipboard.getStringAsync();
          if (current === lastCopied) {
            await Clipboard.setStringAsync("");
          }
        } catch {
          /* ignore */
        } finally {
          lastCopied = null;
          clearTimer = null;
        }
      })();
    }, ttlMs);

    // Portable path: TTL clear only (not Universal Clipboard–safe until native).
    return { copied: true, clearedAfterMs: ttlMs, localOnly: false };
  });
}
