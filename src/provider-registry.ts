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
  const jira = BUNDLED_PROVIDERS.jira;
  return [
    ...google,
    { abs: resolvePath(root, cloudflare.bundledSpecPath), label: cloudflare.id },
    { abs: resolvePath(root, jira.bundledSpecPath), label: jira.id },
  ];
}

export const BUNDLED_PROVIDER_GROUPS: Record<string, BundledProviderGroup> = {
  atlassian: { providers: ["jira", "bitbucket"] },
  "google-top50": { resolve: resolveGoogleTop50Items },
  "default-multi-provider": { resolve: resolveDefaultMultiProviderItems },
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
