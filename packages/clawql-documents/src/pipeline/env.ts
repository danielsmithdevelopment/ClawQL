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
