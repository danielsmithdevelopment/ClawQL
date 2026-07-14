/** AP2 feature flags. */

export function isAp2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_AP2_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** When set with AP2 enabled, gate enforcement requires a valid Payment Mandate. */
export function isAp2Required(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isAp2Enabled(env)) return false;
  const raw = env.CLAWQL_AP2_REQUIRE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function ap2HmacSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const secret = env.CLAWQL_AP2_HMAC_SECRET?.trim();
  return secret || undefined;
}

export function ap2Issuer(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const iss = env.CLAWQL_AP2_ISSUER?.trim();
  return iss || undefined;
}
