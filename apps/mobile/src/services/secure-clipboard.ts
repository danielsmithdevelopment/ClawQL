/**
 * Copy sensitive strings (API key secrets) with local-only pasteboard semantics.
 *
 * Production path uses the `clawql-secure-clipboard` Expo module:
 * - iOS: UIPasteboard localOnly + expirationDate (no Universal Clipboard sync)
 * - Android: sensitive clip + TTL clear
 *
 * Without the native bridge (web / Expo Go without rebuild), we do **not**
 * auto-copy — the UI must show the secret for manual selection instead.
 */
import { Effect } from "effect";

import {
  getSecureClipboardNative,
  setSecretLocalOnly,
} from "../../modules/clawql-secure-clipboard/src";

const DEFAULT_TTL_MS = 60_000;

export type CopySecretOptions = {
  readonly ttlMs?: number;
};

export type CopySecretResult = {
  readonly copied: boolean;
  readonly clearedAfterMs: number;
  readonly localOnly: boolean;
  /** True when the caller must show the secret for manual copy (no pasteboard write). */
  readonly manualOnly: boolean;
};

/** Test / Maestro injection — prefer this over the native module when set. */
export type SecureClipboardNative = {
  readonly setSecret: (text: string, ttlMs: number) => Promise<boolean>;
};

declare global {
  // eslint-disable-next-line no-var
  var __CLAWQL_SECURE_CLIPBOARD__: SecureClipboardNative | undefined;
}

export function isSecureClipboardBridgeAvailable(): boolean {
  if (globalThis.__CLAWQL_SECURE_CLIPBOARD__) return true;
  return getSecureClipboardNative() != null;
}

/**
 * Copies `text` only when a local-only native bridge is available.
 * Otherwise returns `manualOnly: true` — never write secrets to a syncing pasteboard.
 */
export function copySecretEffect(
  text: string,
  options?: CopySecretOptions
): Effect.Effect<CopySecretResult> {
  return Effect.gen(function* () {
    const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    const injected = globalThis.__CLAWQL_SECURE_CLIPBOARD__;

    if (injected) {
      const ok = yield* Effect.tryPromise({
        try: () => injected.setSecret(text, ttlMs),
        catch: () => false,
      }).pipe(Effect.catch(() => Effect.succeed(false)));
      return {
        copied: ok,
        clearedAfterMs: ok ? ttlMs : 0,
        localOnly: ok,
        manualOnly: !ok,
      };
    }

    const ok = yield* Effect.tryPromise({
      try: () => setSecretLocalOnly(text, ttlMs),
      catch: () => false,
    }).pipe(Effect.catch(() => Effect.succeed(false)));

    if (ok) {
      return {
        copied: true,
        clearedAfterMs: ttlMs,
        localOnly: true,
        manualOnly: false,
      };
    }

    return {
      copied: false,
      clearedAfterMs: 0,
      localOnly: false,
      manualOnly: true,
    };
  });
}
