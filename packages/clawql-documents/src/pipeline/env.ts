/** IDP automated pipeline runner env ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)). */

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function idpPipelineRunnerEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_ENABLE_IDP_PIPELINE);
}

export function idpPipelineMaxRetries(): number {
  const raw = process.env.CLAWQL_IDP_PIPELINE_MAX_RETRIES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 2;
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

export function idpPipelineRetryDelayMs(): number {
  const raw = process.env.CLAWQL_IDP_PIPELINE_RETRY_DELAY_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 500;
  return Number.isFinite(n) && n >= 0 ? n : 500;
}

export function merklePerHopEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_MERKLE_ENABLED);
}

/** Comma-separated Stirling `listOfText` patterns (document-stage redact). */
export function idpRedactList(): string {
  return (
    process.env.CLAWQL_IDP_REDACT_LIST?.trim() ||
    process.env.CLAWQL_STIRLING_REDACT_LIST?.trim() ||
    ""
  );
}

export function idpRedactUseRegex(): boolean {
  const raw = process.env.CLAWQL_IDP_REDACT_USE_REGEX?.trim().toLowerCase();
  if (raw === undefined || raw === "") return true;
  return raw === "1" || raw === "true" || raw === "yes";
}

/** When true, fail the pipeline if the Stirling redact hop is skipped. */
export function idpRequireStirlingRedact(): boolean {
  return envTruthy(process.env.CLAWQL_IDP_REQUIRE_STIRLING_REDACT);
}
