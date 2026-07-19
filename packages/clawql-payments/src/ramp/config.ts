/** Ramp Developer API — agent virtual cards, funds, spend controls. */

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

export function isRampConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RAMP_CLIENT_ID?.trim() && env.RAMP_CLIENT_SECRET?.trim());
}

export function isRampEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseFalsey(env.CLAWQL_RAMP_ENABLED)) return false;
  if (parseTruthy(env.CLAWQL_RAMP_ENABLED)) return true;
  return isRampConfigured(env);
}

export function isRampDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseTruthy(env.CLAWQL_RAMP_DRY_RUN)) return true;
  if (parseFalsey(env.CLAWQL_RAMP_DRY_RUN)) return false;
  return !isRampConfigured(env);
}

/**
 * Prefer native Agent Cards API (`cards:read_agentic`) over Vault PCI path.
 * Enabled via CLAWQL_RAMP_AGENTIC=1 or when RAMP_OAUTH_SCOPES includes cards:read_agentic.
 */
export function isRampAgenticEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseFalsey(env.CLAWQL_RAMP_AGENTIC)) return false;
  if (parseTruthy(env.CLAWQL_RAMP_AGENTIC)) return true;
  const scopes = env.RAMP_OAUTH_SCOPES?.trim() ?? "";
  return scopes.split(/\s+/).includes("cards:read_agentic");
}

export function rampEnvironment(env: NodeJS.ProcessEnv = process.env): "demo" | "production" {
  const raw = env.RAMP_ENVIRONMENT?.trim().toLowerCase();
  if (raw === "production" || raw === "prod" || raw === "live") return "production";
  return "demo";
}

/** OAuth + REST API base (non-vault). */
export function rampApiBase(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.RAMP_API_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return rampEnvironment(env) === "production"
    ? "https://api.ramp.com"
    : "https://demo-api.ramp.com";
}

/** Vault API base (PAN/CVV — sandbox always; prod needs PCI qualification). */
export function rampVaultApiBase(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.RAMP_VAULT_API_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return rampEnvironment(env) === "production"
    ? "https://vault-api.ramp.com"
    : "https://demo-vault-api.ramp.com";
}

export function rampClientId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.RAMP_CLIENT_ID?.trim() || undefined;
}

export function rampClientSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.RAMP_CLIENT_SECRET?.trim() || undefined;
}

const DEFAULT_VAULT_SCOPES =
  "funds:read funds:write cards:read cards:read_vault limits:write users:read";

const DEFAULT_AGENTIC_SCOPES =
  "funds:read funds:write cards:read cards:read_agentic spend_limits:write limits:write users:read";

/** Default OAuth scopes — agentic adds `cards:read_agentic` + `spend_limits:write`. */
export function rampOAuthScopes(env: NodeJS.ProcessEnv = process.env): string {
  if (env.RAMP_OAUTH_SCOPES?.trim()) return env.RAMP_OAUTH_SCOPES.trim();
  return isRampAgenticEnabled(env) ? DEFAULT_AGENTIC_SCOPES : DEFAULT_VAULT_SCOPES;
}

/**
 * POST path (relative to API base) to mint an agentic card / credential.
 * Override when Ramp grants a different path for your app.
 */
export function rampAgenticIssuePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.RAMP_AGENTIC_ISSUE_PATH?.trim();
  if (explicit) return explicit.startsWith("/") ? explicit : `/${explicit}`;
  return "/developer/v1/cards/agentic";
}

/**
 * POST path template for fund-scoped single-use agentic creds.
 * `{fundId}` is substituted. Mirrors Ramp CLI `funds creds`.
 */
export function rampAgenticCredsPath(fundId: string, env: NodeJS.ProcessEnv = process.env): string {
  const template = env.RAMP_AGENTIC_CREDS_PATH?.trim() || "/developer/v1/funds/{fundId}/creds";
  const path = template.replace("{fundId}", encodeURIComponent(fundId));
  return path.startsWith("/") ? path : `/${path}`;
}

/** GET path for reading agentic card metadata (no PAN unless granted). */
export function rampAgenticReadPath(cardId: string, env: NodeJS.ProcessEnv = process.env): string {
  const template = env.RAMP_AGENTIC_READ_PATH?.trim() || "/developer/v1/cards/agentic/{cardId}";
  const path = template.replace("{cardId}", encodeURIComponent(cardId));
  return path.startsWith("/") ? path : `/${path}`;
}
