/** Consumer crypto→fiat off-ramp adapters (Moonpay / Transak). */

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

function parseFalsey(value: string | undefined): boolean {
  if (value === undefined) return false;
  const n = value.trim().toLowerCase();
  return n === "0" || n === "false" || n === "no" || n === "off";
}

export type OffRampProvider = "moonpay" | "transak";

export function isOffRampEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseFalsey(env.CLAWQL_OFFRAMP_ENABLED)) return false;
  if (parseTruthy(env.CLAWQL_OFFRAMP_ENABLED)) return true;
  return Boolean(env.MOONPAY_API_KEY?.trim() || env.TRANSAK_API_KEY?.trim());
}

export function isOffRampDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseTruthy(env.CLAWQL_OFFRAMP_DRY_RUN)) return true;
  if (parseFalsey(env.CLAWQL_OFFRAMP_DRY_RUN)) return false;
  return !env.MOONPAY_API_KEY?.trim() && !env.TRANSAK_API_KEY?.trim();
}

export function defaultOffRampProvider(env: NodeJS.ProcessEnv = process.env): OffRampProvider {
  const raw = env.CLAWQL_OFFRAMP_PROVIDER?.trim().toLowerCase();
  if (raw === "transak") return "transak";
  if (raw === "moonpay") return "moonpay";
  if (env.MOONPAY_API_KEY?.trim()) return "moonpay";
  if (env.TRANSAK_API_KEY?.trim()) return "transak";
  return "moonpay";
}

export function moonpayApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.MOONPAY_API_KEY?.trim() || undefined;
}

export function transakApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.TRANSAK_API_KEY?.trim() || undefined;
}

export function moonpaySellBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.MOONPAY_SELL_URL?.trim() || "https://sell.moonpay.com";
}

export function transakBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const envName = env.TRANSAK_ENVIRONMENT?.trim().toLowerCase();
  if (env.TRANSAK_WIDGET_URL?.trim()) return env.TRANSAK_WIDGET_URL.trim();
  if (envName === "production" || envName === "prod" || envName === "live") {
    return "https://global.transak.com";
  }
  return "https://global-stg.transak.com";
}
