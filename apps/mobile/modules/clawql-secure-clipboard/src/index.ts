/**
 * Native bridge for local-only, expiring pasteboard writes.
 * Autolinked from apps/mobile/modules via Expo.
 *
 * Loads expo-modules-core lazily so unit tests can mock / skip native.
 */
type ClawqlSecureClipboardNativeModule = {
  setSecretAsync(text: string, ttlMs: number): Promise<boolean>;
  excludeFromBackupAsync(path: string): Promise<boolean>;
  isAvailableAsync(): Promise<boolean>;
};

let native: ClawqlSecureClipboardNativeModule | null | undefined;

function loadNative(): ClawqlSecureClipboardNativeModule | null {
  if (native !== undefined) return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as typeof import("react-native");
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      native = null;
      return native;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require("expo-modules-core") as {
      requireNativeModule: <T>(name: string) => T;
    };
    native = requireNativeModule<ClawqlSecureClipboardNativeModule>("ClawqlSecureClipboard");
  } catch {
    native = null;
  }
  return native;
}

export async function setSecretLocalOnly(text: string, ttlMs: number): Promise<boolean> {
  const mod = loadNative();
  if (!mod?.setSecretAsync) return false;
  return mod.setSecretAsync(text, ttlMs);
}

export async function excludePathFromBackup(path: string): Promise<boolean> {
  const mod = loadNative();
  if (!mod?.excludeFromBackupAsync) return false;
  return mod.excludeFromBackupAsync(path);
}

export async function isSecureClipboardAvailable(): Promise<boolean> {
  const mod = loadNative();
  if (!mod?.isAvailableAsync) return false;
  try {
    return await mod.isAvailableAsync();
  } catch {
    return false;
  }
}

export function getSecureClipboardNative(): ClawqlSecureClipboardNativeModule | null {
  return loadNative();
}
