/**
 * REST / GraphQL→REST upstream headers: per-`specLabel` auth for merged **`execute`**, plus optional globals.
 *
 * **Isolation:** each upstream call only receives credentials chosen for **that** merged **`specLabel`** (or
 * **`CLAWQL_PROVIDER`** when no label). There is **no** cross-vendor reuse of `GOOGLE_ACCESS_TOKEN` on GitHub/Cloudflare,
 * and **`CLAWQL_BEARER_TOKEN`** is **not** sent to Slack, Sentry, n8n, or Google Cloud slugs (use vendor env vars or
 * **`CLAWQL_PROVIDER_AUTH_JSON`**). **`CLAWQL_BEARER_TOKEN`** remains available for **GitHub**, **Cloudflare** (Bearer
 * fallback after **`CLAWQL_CLOUDFLARE_API_TOKEN`** / **`CLOUDFLARE_API_TOKEN`** or **`CLOUDFLARE_EMAIL`** +
 * **`CLOUDFLARE_API_KEY`** Global Key pair), **Jira/Bitbucket/Atlassian**, and optional **Tika/Gotenberg** self-hosted auth.
 *
 * **One-shot multi-provider credentials:** set **`CLAWQL_PROVIDER_AUTH_JSON`** to a JSON object whose keys are
 * merged **`specLabel`** values (`github`, `cloudflare`, `slack`, `compute-v1`, …). Each value is either a **string**
 * (becomes `Authorization: Bearer …` unless it already starts with `Bearer `, `Token `, or `Basic `) or a **JSON object**
 * of header names → values (e.g. `{ "Authorization": "Token …", "X-Custom": "1" }`). Use the key **`google`** as a
 * catch-all for every Google Cloud Discovery slug (`compute-v1`, `container-v1`, …) when you do not list each slug.
 *
 * **Global non-auth headers:** **`CLAWQL_HTTP_HEADERS`** JSON is merged first. If **`CLAWQL_PROVIDER_AUTH_JSON`** is
 * unset, a single **`Authorization`** entry there still wins for every call (legacy). When **`CLAWQL_PROVIDER_AUTH_JSON`**
 * is set, **`Authorization`** / **`authorization`** in **`CLAWQL_HTTP_HEADERS`** is ignored so each provider can use
 * its own token from the map or from the usual env vars (`CLAWQL_GITHUB_TOKEN`, …).
 *
 * Self-hosted document APIs: **`paperless`** → `PAPERLESS_API_TOKEN` as `Authorization: Token …`;
 * **`stirling`** → `STIRLING_API_KEY` as `X-API-KEY`; **`tika`** / **`gotenberg`** → optional `CLAWQL_BEARER_TOKEN`.
 * **`onyx`** → `ONYX_API_TOKEN` / `CLAWQL_ONYX_API_TOKEN` as `Authorization: Bearer …`.
 */

function trimEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

function parseJsonHeaders(raw: string | undefined, label: string): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o !== "object" || o === null || Array.isArray(o)) {
      console.error(`[auth-headers] Invalid ${label} (expected JSON object)`);
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    console.error(`[auth-headers] Invalid ${label} (expected JSON object)`);
    return {};
  }
}

function normalizeAuthEntry(value: unknown): Record<string, string> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return undefined;
    if (/^(bearer|token|basic)\s+/i.test(t)) {
      return { Authorization: t };
    }
    return { Authorization: `Bearer ${t}` };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

function loadProviderAuthMap(): Record<string, Record<string, string>> | undefined {
  const raw = process.env.CLAWQL_PROVIDER_AUTH_JSON?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      console.error("[auth-headers] Invalid CLAWQL_PROVIDER_AUTH_JSON (expected JSON object)");
      return undefined;
    }
    const out: Record<string, Record<string, string>> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const key = k.trim().toLowerCase();
      if (!key) continue;
      const norm = normalizeAuthEntry(v);
      if (norm) out[key] = norm;
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    console.error("[auth-headers] Invalid CLAWQL_PROVIDER_AUTH_JSON (parse error)");
    return undefined;
  }
}

function collapseAuthorization(out: Record<string, string>): Record<string, string> {
  const lower = out.authorization;
  if (lower && !out.Authorization) {
    out.Authorization = lower;
    delete out.authorization;
  }
  return out;
}

/**
 * True for merged-preset id `google`, or Google Cloud Discovery API slugs from the bundled manifest
 * (e.g. `compute-v1`, `container-v1`).
 */
export function isGoogleDiscoverySpecLabel(label: string): boolean {
  const s = label.trim().toLowerCase();
  if (s === "google") return true;
  return /^[a-z0-9][a-z0-9-]*-v[a-z0-9]+$/i.test(s);
}

function envResolvedAuthHeaders(specLabel?: string): Record<string, string> {
  const label = specLabel?.trim().toLowerCase();
  const prov = process.env.CLAWQL_PROVIDER?.trim().toLowerCase();
  const effective = label || prov;
  if (!effective) return {};

  if (effective === "paperless") {
    const tok = trimEnv("PAPERLESS_API_TOKEN", "CLAWQL_PAPERLESS_API_TOKEN");
    if (!tok) return {};
    const rawTok = tok.trim();
    return {
      Authorization: /^token\s+/i.test(rawTok) ? rawTok : `Token ${rawTok}`,
    };
  }
  if (effective === "stirling") {
    const key = trimEnv("STIRLING_API_KEY", "CLAWQL_STIRLING_API_KEY");
    if (!key) return {};
    return { "X-API-KEY": key };
  }

  if (effective === "github") {
    const bearer = trimEnv(
      "CLAWQL_GITHUB_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "CLAWQL_BEARER_TOKEN"
    );
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }
  if (effective === "cloudflare") {
    const explicitToken = trimEnv("CLAWQL_CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_TOKEN");
    if (explicitToken) {
      return { Authorization: `Bearer ${explicitToken}` };
    }
    const email = trimEnv("CLAWQL_CLOUDFLARE_EMAIL", "CLOUDFLARE_EMAIL");
    const globalKey = trimEnv(
      "CLAWQL_CLOUDFLARE_GLOBAL_API_KEY",
      "CLOUDFLARE_GLOBAL_API_KEY",
      "CLOUDFLARE_API_KEY"
    );
    if (email && globalKey) {
      return { "X-Auth-Email": email, "X-Auth-Key": globalKey };
    }
    const bearerFallback = trimEnv("CLAWQL_BEARER_TOKEN");
    return bearerFallback ? { Authorization: `Bearer ${bearerFallback}` } : {};
  }
  if (effective === "tika" || effective === "gotenberg") {
    const bearer = trimEnv("CLAWQL_BEARER_TOKEN");
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }
  if (effective === "onyx") {
    const bearer = trimEnv("ONYX_API_TOKEN", "CLAWQL_ONYX_API_TOKEN");
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }

  if ((label && isGoogleDiscoverySpecLabel(label)) || isGoogleDiscoverySpecLabel(effective)) {
    const bearer = trimEnv("CLAWQL_GOOGLE_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN");
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }

  if (effective === "jira" || effective === "bitbucket") {
    const bearer = trimEnv(
      "CLAWQL_ATLASSIAN_TOKEN",
      "ATLASSIAN_API_TOKEN",
      "JIRA_API_TOKEN",
      "CLAWQL_JIRA_TOKEN",
      "CLAWQL_BEARER_TOKEN"
    );
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }
  if (effective === "atlassian") {
    const bearer = trimEnv("CLAWQL_ATLASSIAN_TOKEN", "ATLASSIAN_API_TOKEN", "CLAWQL_BEARER_TOKEN");
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }
  if (effective === "slack") {
    const bearer = trimEnv(
      "SLACK_BOT_TOKEN",
      "CLAWQL_SLACK_BOT_TOKEN",
      "SLACK_TOKEN",
      "CLAWQL_SLACK_TOKEN"
    );
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }
  if (effective === "sentry") {
    const bearer = trimEnv(
      "SENTRY_AUTH_TOKEN",
      "CLAWQL_SENTRY_AUTH_TOKEN",
      "SENTRY_TOKEN",
      "CLAWQL_SENTRY_TOKEN"
    );
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }
  if (effective === "n8n") {
    const key = trimEnv("N8N_API_KEY", "CLAWQL_N8N_API_KEY");
    return key ? { "X-N8N-API-KEY": key } : {};
  }

  /** Linear GraphQL — API key in `Authorization` without a `Bearer` prefix (see Linear API docs). */
  if (effective === "linear") {
    const key = trimEnv("LINEAR_API_KEY", "CLAWQL_LINEAR_API_KEY");
    return key ? { Authorization: key.trim() } : {};
  }

  return {};
}

/**
 * Resolve upstream HTTP headers for **`execute`** / GraphQL→REST.
 *
 * Precedence when **`CLAWQL_PROVIDER_AUTH_JSON`** is set: non-Authorization keys from **`CLAWQL_HTTP_HEADERS`**,
 * then env-based auth for **`specLabel`**, then map entry for that label (or **`google`** catch-all for GCP slugs),
 * with map keys overriding env.
 *
 * When the map is **unset** and **`CLAWQL_HTTP_HEADERS`** contains **`Authorization`**, that single value is used
 * for every call (legacy single-tenant mode).
 */
export function mergedAuthHeaders(specLabel?: string): Record<string, string> {
  const http = parseJsonHeaders(process.env.CLAWQL_HTTP_HEADERS, "CLAWQL_HTTP_HEADERS");
  const providerMap = loadProviderAuthMap();
  const labelKey = specLabel?.trim().toLowerCase();

  const out: Record<string, string> = {};

  if (!providerMap) {
    Object.assign(out, http);
    if (out.Authorization || out.authorization) {
      return collapseAuthorization(out);
    }
    Object.assign(out, envResolvedAuthHeaders(specLabel));
    return collapseAuthorization(out);
  }

  for (const [k, v] of Object.entries(http)) {
    if (k.toLowerCase() === "authorization") continue;
    out[k] = v;
  }

  Object.assign(out, envResolvedAuthHeaders(specLabel));

  const exact = labelKey ? providerMap[labelKey] : undefined;
  const googleCatch =
    !exact && labelKey && isGoogleDiscoverySpecLabel(labelKey) ? providerMap["google"] : undefined;
  const overlay = exact ?? googleCatch;
  if (overlay) {
    Object.assign(out, overlay);
  }

  return collapseAuthorization(out);
}
