/**
 * Built-in providers: bundled OpenAPI / Discovery on disk + optional
 * pregenerated GraphQL artifacts (see scripts/pregenerate-provider-graphql.ts).
 */

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
