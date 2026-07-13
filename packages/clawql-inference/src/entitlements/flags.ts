function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isInferenceEntitlementEnforcementActive(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return parseTruthy(env.CLAWQL_PAYMENTS_ENFORCE_INFERENCE);
}
