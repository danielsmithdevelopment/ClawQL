/**
 * REST / GraphQL→REST upstream headers: `CLAWQL_HTTP_HEADERS` JSON plus bearer
 * selection by merged `specLabel` (multi-spec) or `CLAWQL_PROVIDER` (single-spec).
 */

function trimEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * True for bundled single provider `google`, or Google top50 manifest slugs
 * (e.g. `compute-v1`, `networksecurity-v1beta1`, `dataflow-v1b3`).
 */
export function isGoogleDiscoverySpecLabel(label: string): boolean {
  const s = label.trim().toLowerCase();
  if (s === "google") return true;
  return /^[a-z0-9][a-z0-9-]*-v[a-z0-9]+$/i.test(s);
}

/**
 * Resolve `Authorization: Bearer …` for an operation.
 * - `specLabel` `github` / `cloudflare` → provider-specific env vars.
 * - Google top50 slugs (see `isGoogleDiscoverySpecLabel`) or `CLAWQL_PROVIDER=google` → GCP/OAuth access token env vars.
 * - Other merged vendors (e.g. Jira in `all-providers`) → `CLAWQL_BEARER_TOKEN` / `GOOGLE_ACCESS_TOKEN`.
 */
export function mergedAuthHeaders(specLabel?: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = process.env.CLAWQL_HTTP_HEADERS;
  if (raw) {
    try {
      Object.assign(out, JSON.parse(raw) as Record<string, string>);
    } catch {
      console.error("[auth-headers] Invalid CLAWQL_HTTP_HEADERS (expected JSON object)");
    }
  }
  if (out.Authorization || out.authorization) {
    return out;
  }

  const label = specLabel?.trim().toLowerCase();
  const prov = process.env.CLAWQL_PROVIDER?.trim().toLowerCase();
  const effective = label || prov;

  let bearer: string | undefined;
  if (effective === "github") {
    bearer = trimEnv(
      "CLAWQL_GITHUB_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "CLAWQL_BEARER_TOKEN",
      "GOOGLE_ACCESS_TOKEN"
    );
  } else if (effective === "cloudflare") {
    bearer = trimEnv(
      "CLAWQL_CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_API_TOKEN",
      "CLAWQL_BEARER_TOKEN",
      "GOOGLE_ACCESS_TOKEN"
    );
  } else if (
    (label && isGoogleDiscoverySpecLabel(label)) ||
    effective === "google" ||
    effective === "google-top50"
  ) {
    bearer = trimEnv("CLAWQL_GOOGLE_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN", "CLAWQL_BEARER_TOKEN");
  } else {
    bearer = trimEnv("CLAWQL_BEARER_TOKEN", "GOOGLE_ACCESS_TOKEN");
  }

  if (bearer) {
    out.Authorization = `Bearer ${bearer}`;
  }
  return out;
}
