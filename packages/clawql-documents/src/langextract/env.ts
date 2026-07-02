/** LangExtract optional extraction layer env ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)). */

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function langextractToolEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_ENABLE_LANGEXTRACT);
}

export function langextractBaseUrl(): string | undefined {
  const raw = process.env.LANGEXTRACT_BASE_URL?.trim();
  return raw || undefined;
}

export function langextractDefaultModelId(): string {
  return process.env.LANGEXTRACT_MODEL_ID?.trim() || "gemini-2.5-flash";
}

export function langextractArtifactsDir(): string {
  return process.env.LANGEXTRACT_ARTIFACTS_DIR?.trim() || "/tmp/langextract-artifacts";
}
