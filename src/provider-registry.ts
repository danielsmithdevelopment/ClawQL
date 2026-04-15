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
 * - `resolve`: custom resolver for manifest-backed groups (e.g. google-top50)
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
    fallbackUrl:
      "https://raw.githubusercontent.com/magmax/atlassian-openapi/master/spec/jira.yaml",
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
  google: {
    id: "google",
    bundledSpecPath: "providers/google/discovery.json",
    format: "discovery",
    fallbackUrl: "https://container.googleapis.com/$discovery/rest?version=v1",
    bundledIntrospectionPath: "providers/google/introspection.json",
    bundledSchemaSdlPath: "providers/google/schema.graphql",
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

async function resolveDefaultMultiProviderItems(): Promise<ProviderGroupItem[]> {
  const root = getPackageRoot();
  const google = await resolveGoogleTop50Items();
  const cloudflare = BUNDLED_PROVIDERS.cloudflare;
  const github = BUNDLED_PROVIDERS.github;
  return [
    ...google,
    { abs: resolvePath(root, cloudflare.bundledSpecPath), label: cloudflare.id },
    { abs: resolvePath(root, github.bundledSpecPath), label: github.id },
  ];
}

/**
 * In a merged load, `specLabel` is each Google top50 API slug (e.g. `container-v1`) or
 * one of these vendor ids — every bundled provider except the single-file `google` discovery.
 */
export const BUNDLED_MERGED_VENDOR_LABELS: readonly string[] = Object.keys(
  BUNDLED_PROVIDERS
)
  .filter((id) => id !== "google")
  .sort();

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
  "google-top50": { resolve: resolveGoogleTop50Items },
  /** Same as no spec env: Google top50 + Cloudflare + GitHub (see `resolveDefaultMultiProviderItems`). */
  "default-multi-provider": { resolve: resolveDefaultMultiProviderItems },
  /** Google top50 + every other bundled vendor (Jira, Bitbucket, Cloudflare, GitHub, Slack, Sentry, n8n). */
  "all-providers": { resolve: resolveAllBundledProvidersItems },
};

export function resolveBundledProvider(
  raw: string | undefined
): BundledProvider | undefined {
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
  const group = BUNDLED_PROVIDER_GROUPS[raw.trim().toLowerCase()];
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
