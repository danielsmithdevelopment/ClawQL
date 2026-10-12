/** Required env for ATTEMPTS_E2E=1 live Cloudflare path. */

export const LIVE_REQUIRED = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
] as const;

export const LIVE_OPTIONAL = ["ARTIFACTS_NAMESPACE", "ARWEAVE_JWK", "DECISIONS_URL"] as const;

export function missingLiveEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return LIVE_REQUIRED.filter((k) => !env[k]?.trim());
}

export function liveEnvReport(env: NodeJS.ProcessEnv = process.env): {
  ready: boolean;
  missing: string[];
  optionalPresent: string[];
} {
  const missing = missingLiveEnv(env);
  return {
    ready: missing.length === 0,
    missing,
    optionalPresent: LIVE_OPTIONAL.filter((k) => !!env[k]?.trim()),
  };
}
