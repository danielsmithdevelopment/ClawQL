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

/** Default OAuth scopes for funds + vault virtual cards. */
export function rampOAuthScopes(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.RAMP_OAUTH_SCOPES?.trim() ||
    "funds:read funds:write cards:read cards:read_vault limits:write users:read"
  );
}
