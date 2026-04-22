/**
 * Built-in providers: bundled OpenAPI / Discovery on disk + optional
 * pregenerated GraphQL artifacts (see scripts/pregenerate-provider-graphql.ts).
 */

import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { getPackageRoot } from "./package-root.js";

export interface BundledProvider {
  id: string;
  /** Relative to package root */
  bundledSpecPath: string;
  format: "openapi" | "discovery";
  /** Used when the bundled file is missing (e.g. before `npm run fetch-provider-specs`) */
  fallbackUrl: string;
  /** Pregenerated introspection JSON (graphql introspectionFromSchema output) */
  bundledIntrospectionPath?: string;
  /** Pregenerated SDL (printSchema), for docs / tooling */
  bundledSchemaSdlPath?: string;
}

export type ProviderGroupItem = { abs: string; label: string };
export type BundledProviderGroupResolver = () => Promise<ProviderGroupItem[]>;

/**
 * Named presets that compose multiple specs into one merged index.
 * - `providers`: references ids from BUNDLED_PROVIDERS
 * - `resolve`: custom resolver for manifest-backed groups (e.g. merged Google Cloud APIs)
 */
export interface BundledProviderGroup {
  providers?: string[];
  resolve?: BundledProviderGroupResolver;
}

export const BUNDLED_PROVIDERS: Record<string, BundledProvider> = {
  jira: {
    id: "jira",
    bundledSpecPath: "providers/atlassian/jira/openapi.yaml",
    format: "openapi",
    fallbackUrl: "https://raw.githubusercontent.com/magmax/atlassian-openapi/master/spec/jira.yaml",
    bundledIntrospectionPath: "providers/atlassian/jira/introspection.json",
    bundledSchemaSdlPath: "providers/atlassian/jira/schema.graphql",
  },
  bitbucket: {
    id: "bitbucket",
    bundledSpecPath: "providers/atlassian/bitbucket/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/magmax/atlassian-openapi/master/spec/bitbucket.yaml",
    bundledIntrospectionPath: "providers/atlassian/bitbucket/introspection.json",
    bundledSchemaSdlPath: "providers/atlassian/bitbucket/schema.graphql",
  },
  /** Full Cloudflare API OpenAPI (large). Prefer committed `providers/cloudflare/openapi.yaml`. */
  cloudflare: {
    id: "cloudflare",
    bundledSpecPath: "providers/cloudflare/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/cloudflare/api-schemas/refs/heads/main/openapi.yaml",
    bundledIntrospectionPath: "providers/cloudflare/introspection.json",
    bundledSchemaSdlPath: "providers/cloudflare/schema.graphql",
  },
  /** GitHub REST (very large). Prefer committed `providers/github/openapi.yaml`. */
  github: {
    id: "github",
    bundledSpecPath: "providers/github/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.yaml",
    bundledIntrospectionPath: "providers/github/introspection.json",
    bundledSchemaSdlPath: "providers/github/schema.graphql",
  },
  /** Slack Web API (OpenAPI 2; loader converts to OAS3). Official copy at api.slack.com/specs. */
  slack: {
    id: "slack",
    bundledSpecPath: "providers/slack/openapi.json",
    format: "openapi",
    fallbackUrl: "https://api.slack.com/specs/openapi/v2/slack_web.json",
    bundledIntrospectionPath: "providers/slack/introspection.json",
    bundledSchemaSdlPath: "providers/slack/schema.graphql",
  },
  /** Sentry public API (dereferenced bundle from getsentry/sentry-api-schema). */
  sentry: {
    id: "sentry",
    bundledSpecPath: "providers/sentry/openapi.json",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/getsentry/sentry-api-schema/main/openapi-derefed.json",
    bundledIntrospectionPath: "providers/sentry/introspection.json",
    bundledSchemaSdlPath: "providers/sentry/schema.graphql",
  },
  /**
   * n8n Public API (bundled spec extracted from Swagger UI; see scripts/fetch-n8n-openapi.mjs).
   * Fallback: same file on the default upstream repo (for clones without `providers/n8n/openapi.json`).
   */
  n8n: {
    id: "n8n",
    bundledSpecPath: "providers/n8n/openapi.json",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/n8n/openapi.json",
    bundledIntrospectionPath: "providers/n8n/introspection.json",
    bundledSchemaSdlPath: "providers/n8n/schema.graphql",
  },
  /** Apache Tika server (JAX-RS). Base URL: TIKA_BASE_URL. */
  tika: {
    id: "tika",
    bundledSpecPath: "providers/tika/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/tika/openapi.yaml",
  },
  /** Gotenberg document conversion API. Base URL: GOTENBERG_BASE_URL. */
  gotenberg: {
    id: "gotenberg",
    bundledSpecPath: "providers/gotenberg/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/gotenberg/openapi.yaml",
  },
  /** Paperless-ngx REST (minimal bundled subset; refresh from /api/schema/). Base URL: PAPERLESS_BASE_URL. */
  paperless: {
    id: "paperless",
    bundledSpecPath: "providers/paperless/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/paperless/openapi.yaml",
  },
  /** Stirling-PDF (minimal stub; refresh from /v3/api-docs). Base URL: STIRLING_BASE_URL. */
  stirling: {
    id: "stirling",
    bundledSpecPath: "providers/stirling/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/stirling/openapi.yaml",
  },
};

async function resolveGoogleTop50Items(): Promise<ProviderGroupItem[]> {
  const root = getPackageRoot();
  const manifestPath = resolvePath(root, "providers/google/google-top50-apis.json");
  const text = await readFile(manifestPath, "utf-8");
  const data = JSON.parse(text) as { apis: Array<{ slug: string }> };
  if (!Array.isArray(data.apis)) {
    throw new Error("google-top50-apis.json: expected apis[]");
  }
  return data.apis.map((a) => ({
    abs: resolvePath(root, "providers/google/apis", a.slug, "discovery.json"),
    label: a.slug,
  }));
}

/**
 * Default merged bundle (no spec env, and `CLAWQL_PROVIDER=default-multi-provider`):
 * **Google** (bundled Google Cloud API set) + **Cloudflare** + **GitHub** + **Slack** + **Paperless** + **Stirling** + **Tika** + **Gotenberg**.
 * For Jira, Bitbucket, Sentry, and n8n as well, use **`all-providers`**.
 */
async function resolveDefaultMultiProviderItems(): Promise<ProviderGroupItem[]> {
  const root = getPackageRoot();
  const google = await resolveGoogleTop50Items();
  const vendorIds = [
    "cloudflare",
    "github",
    "slack",
    "paperless",
    "stirling",
    "tika",
    "gotenberg",
  ] as const;
  const rest = vendorIds.map((id) => {
    const p = BUNDLED_PROVIDERS[id];
    return { abs: resolvePath(root, p.bundledSpecPath), label: p.id };
  });
  return [...google, ...rest];
}

/**
 * In a merged load, `specLabel` is each Google Cloud API slug from the bundled manifest (e.g. `container-v1`) or
 * one of these non-Google bundled vendor ids (`BUNDLED_PROVIDERS` keys; Google Cloud uses the manifest, not a single file here).
 */
export const BUNDLED_MERGED_VENDOR_LABELS: readonly string[] =
  Object.keys(BUNDLED_PROVIDERS).sort();

async function resolveAllBundledProvidersItems(): Promise<ProviderGroupItem[]> {
  const root = getPackageRoot();
  const google = await resolveGoogleTop50Items();
  const rest = BUNDLED_MERGED_VENDOR_LABELS.map((id) => {
    const p = BUNDLED_PROVIDERS[id];
    return {
      abs: resolvePath(root, p.bundledSpecPath),
      label: p.id,
    };
  });
  return [...google, ...rest];
}

export const BUNDLED_PROVIDER_GROUPS: Record<string, BundledProviderGroup> = {
  atlassian: { providers: ["jira", "bitbucket"] },
  /** Merged bundled Google Cloud APIs from `providers/google/google-top50-apis.json` (see providers docs). */
  google: { resolve: resolveGoogleTop50Items },
  /** Same as no spec env: Google Cloud bundle + Cloudflare + GitHub + Slack + Paperless + Stirling + Tika + Gotenberg. */
  "default-multi-provider": { resolve: resolveDefaultMultiProviderItems },
  /** Google Cloud bundle + every other bundled vendor (Jira, Bitbucket, Cloudflare, GitHub, Slack, Sentry, n8n, …). */
  "all-providers": { resolve: resolveAllBundledProvidersItems },
};

/** Deprecated merged preset id — resolves the same as `google`. */
const BUNDLED_PROVIDER_GROUP_ALIASES: Record<string, string> = {
  "google-top50": "google",
};

export function resolveBundledProvider(raw: string | undefined): BundledProvider | undefined {
  if (!raw?.trim()) return undefined;
  return BUNDLED_PROVIDERS[raw.trim().toLowerCase()];
}

export function listBundledProviderIds(): string[] {
  return Object.keys(BUNDLED_PROVIDERS);
}

export function listBundledProviderGroupIds(): string[] {
  return Object.keys(BUNDLED_PROVIDER_GROUPS);
}

export async function resolveBundledProviderGroup(
  raw: string | undefined
): Promise<ProviderGroupItem[] | undefined> {
  if (!raw?.trim()) return undefined;
  const key = raw.trim().toLowerCase();
  const canonical = BUNDLED_PROVIDER_GROUP_ALIASES[key] ?? key;
  const group = BUNDLED_PROVIDER_GROUPS[canonical];
  if (!group) return undefined;
  if (group.resolve) return group.resolve();
  const ids = group.providers ?? [];
  return ids.map((id) => {
    const p = BUNDLED_PROVIDERS[id];
    if (!p) {
      throw new Error(
        `Bundled provider group "${raw.trim()}" references unknown provider "${id}".`
      );
    }
    return {
      abs: resolvePath(getPackageRoot(), p.bundledSpecPath),
      label: p.id,
    };
  });
}
