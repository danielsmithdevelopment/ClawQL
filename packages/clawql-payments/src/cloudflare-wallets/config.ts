/** Cloudflare Wallets (cloudflare.pay) — identity + capped Virtual Wallets. */

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseFalsey(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off"
  );
}

/**
 * Opt-in until the Virtual Wallet API is public.
 * Default off — enable with CLAWQL_CLOUDFLARE_WALLETS=1 (dry-run by default).
 */
export function isCloudflareWalletsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseTruthy(env.CLAWQL_CLOUDFLARE_WALLETS);
}

/**
 * Live API calls when credentials exist and dry-run is not forced.
 * Until Cloudflare ships the API, dry-run is always the effective mode.
 */
export function isCloudflareWalletsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.CLOUDFLARE_WALLETS_API_TOKEN?.trim() || env.CLOUDFLARE_API_TOKEN?.trim()
  );
}

export function isCloudflareWalletsDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseTruthy(env.CLAWQL_CLOUDFLARE_WALLETS_DRY_RUN)) return true;
  if (parseFalsey(env.CLAWQL_CLOUDFLARE_WALLETS_DRY_RUN)) {
    // Live mode requested but API not available yet — stay dry-run.
    if (!isCloudflareWalletsConfigured(env) || !cloudflareWalletsApiBase(env)) return true;
    return false;
  }
  return true;
}

/** Reserved org handle (without scheme), e.g. clawql.cloudflare.pay */
export function cloudflareWalletsHandle(env: NodeJS.ProcessEnv = process.env): string {
  const raw =
    env.CLAWQL_CLOUDFLARE_WALLETS_HANDLE?.trim() ||
    env.CLOUDFLARE_WALLETS_HANDLE?.trim() ||
    "clawql.cloudflare.pay";
  return normalizeCloudflarePayHandle(raw);
}

/**
 * API base when Cloudflare ships Virtual Wallet HTTP APIs.
 * Empty string means “not available yet” (dry-run local store only).
 */
export function cloudflareWalletsApiBase(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLOUDFLARE_WALLETS_API_BASE?.trim() || "";
}

export function cloudflareWalletsApiToken(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLOUDFLARE_WALLETS_API_TOKEN?.trim() || env.CLOUDFLARE_API_TOKEN?.trim() || "";
}

/** Normalize @clawql / clawql / clawql.cloudflare.pay → clawql.cloudflare.pay */
export function normalizeCloudflarePayHandle(input: string): string {
  let s = input.trim().toLowerCase();
  if (s.startsWith("@")) s = s.slice(1);
  if (s.startsWith("https://")) s = s.slice("https://".length);
  if (s.startsWith("http://")) s = s.slice("http://".length);
  s = s.replace(/\/+$/, "");
  if (!s.includes(".")) {
    return `${s}.cloudflare.pay`;
  }
  if (s.endsWith(".cloudflare.pay")) return s;
  // already a dotted handle under another TLD — leave as-is for resolve errors
  return s;
}

export function cloudflarePayHandleUri(handle: string): string {
  const normalized = normalizeCloudflarePayHandle(handle);
  return `https://${normalized}`;
}
