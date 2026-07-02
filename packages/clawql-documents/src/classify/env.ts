/** Reference classifier HTTP client env ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)). */

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function idpClassifierToolEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_ENABLE_IDP_CLASSIFIER);
}

export function classifierBaseUrl(): string | undefined {
  const raw = process.env.CLASSIFIER_BASE_URL?.trim();
  return raw || undefined;
}

export function classifierMinConfidence(): number {
  const raw = process.env.CLASSIFIER_MIN_CONFIDENCE?.trim();
  const n = raw ? Number.parseFloat(raw) : 0.85;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.85;
}
