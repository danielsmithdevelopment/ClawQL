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
 * Resolve `Authorization: Bearer …` for an operation.
 * - When `specLabel` is set (multi-spec merge), it selects GitHub vs Cloudflare tokens.
 * - When unset, `CLAWQL_PROVIDER` selects the same for single-vendor mode.
 * - Falls back to `CLAWQL_BEARER_TOKEN` / `GOOGLE_ACCESS_TOKEN`.
 */
export function mergedAuthHeaders(specLabel?: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = process.env.CLAWQL_HTTP_HEADERS;
  if (raw) {
    try {
      Object.assign(out, JSON.parse(raw) as Record<string, string>);
    } catch {
      console.error(
        "[auth-headers] Invalid CLAWQL_HTTP_HEADERS (expected JSON object)"
      );
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
  } else {
    bearer = trimEnv(
      "CLAWQL_BEARER_TOKEN",
      "GOOGLE_ACCESS_TOKEN",
      "CLAWQL_CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_API_TOKEN"
    );
  }

  if (bearer) {
    out.Authorization = `Bearer ${bearer}`;
  }
  return out;
}
