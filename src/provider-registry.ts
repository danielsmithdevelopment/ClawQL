/**
 * Built-in providers: bundled OpenAPI / Discovery on disk + optional
 * pregenerated GraphQL artifacts (see scripts/pregenerate-provider-graphql.ts), plus **GraphQL-only** vendors
 * (SDL on disk — e.g. Linear).
 */

import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { getClawqlOptionalToolFlags } from "./clawql-optional-flags.js";
import { getPackageRoot } from "./package-root.js";

/** REST / Discovery bundled spec under `providers/`. */
export interface BundledOpenApiProvider {
  id: string;
  format: "openapi" | "discovery";
  /** Relative to package root */
  bundledSpecPath: string;
  /** Used when the bundled file is missing (e.g. before `npm run fetch-provider-specs`) */
  fallbackUrl: string;
  bundledIntrospectionPath?: string;
  bundledSchemaSdlPath?: string;
}

/**
 * GraphQL-only vendor: no OpenAPI file — operation index from vendored SDL (`bundledSchemaSdlPath`).
 * **`execute`** POSTs to **`graphqlEndpoint`**.
 */
export interface BundledGraphqlProvider {
  id: string;
  format: "graphql";
  graphqlEndpoint: string;
  /** SDL relative to package root */
  bundledSchemaSdlPath: string;
  /** e.g. raw GitHub URL to refresh `bundledSchemaSdlPath` when missing locally */
  fallbackUrl: string;
}

export type BundledProvider = BundledOpenApiProvider | BundledGraphqlProvider;

export function isBundledGraphqlProvider(p: BundledProvider): p is BundledGraphqlProvider {
  return p.format === "graphql";
}

export type ProviderGroupOpenApiItem = { kind: "openapi"; abs: string; label: string };
export type ProviderGroupGraphqlItem = {
  kind: "graphql";
  label: string;
  endpoint: string;
  schemaAbs: string;
  fallbackUrl: string;
};
export type ProviderGroupItem = ProviderGroupOpenApiItem | ProviderGroupGraphqlItem;
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
  /**
   * Onyx enterprise search — minimal `POST /search/send-search-message` subset.
   * Base URL: ONYX_BASE_URL (API root, often includes `/api`). Auth: ONYX_API_TOKEN (Bearer).
   */
  onyx: {
    id: "onyx",
    bundledSpecPath: "providers/onyx/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/onyx/openapi.yaml",
  },
  /**
   * Linear — public GraphQL API only (no REST OpenAPI).
   * SDL is vendored from Linear's MIT-licensed SDK (`packages/sdk/src/schema.graphql`).
   * Auth: **`LINEAR_API_KEY`** / **`CLAWQL_LINEAR_API_KEY`** → `Authorization` (raw key; not `Bearer`).
   */
  linear: {
    id: "linear",
    format: "graphql",
    graphqlEndpoint: "https://api.linear.app/graphql",
    bundledSchemaSdlPath: "providers/linear/schema.graphql",
    fallbackUrl:
      "https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql",
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
    kind: "openapi" as const,
    abs: resolvePath(root, "providers/google/apis", a.slug, "discovery.json"),
    label: a.slug,
  }));
}

/**
 * Build a merged load from a comma/semicolon/newline-separated list of **bundled** ids
 * (keys of **`BUNDLED_PROVIDERS`**, case-insensitive) and/or **`google`** (full bundled Google Cloud Discovery set
 * from `google-top50-apis.json`). Use **`CLAWQL_BUNDLED_PROVIDERS`** in `spec-loader`; there is no other default
 * custom merge — only this list, path list, or **`all-providers`**. Deprecated id **`google-top50`** is accepted as
 * an alias for **`google`**.
 */
export async function resolveItemsFromBundledProviderEnvList(
  raw: string
): Promise<ProviderGroupItem[]> {
  const parts = raw
    .split(/[,\n;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error("CLAWQL_BUNDLED_PROVIDERS is set but contains no provider ids");
  }
  const seen = new Set<string>();
  const out: ProviderGroupItem[] = [];
  for (const part of parts) {
    const id = part === "google-top50" ? "google" : part;
    if (id === "google") {
      for (const g of await resolveGoogleTop50Items()) {
        if (seen.has(g.label)) continue;
        seen.add(g.label);
        out.push(g);
      }
      continue;
    }
    const p = BUNDLED_PROVIDERS[id];
    if (!p) {
      const valid = [...Object.keys(BUNDLED_PROVIDERS), "google"].sort().join(", ");
      throw new Error(`Unknown id "${part}" in CLAWQL_BUNDLED_PROVIDERS. Valid: ${valid}`);
    }
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (isBundledGraphqlProvider(p)) {
      out.push({
        kind: "graphql",
        label: p.id,
        endpoint: p.graphqlEndpoint,
        schemaAbs: resolvePath(getPackageRoot(), p.bundledSchemaSdlPath),
        fallbackUrl: p.fallbackUrl,
      });
      continue;
    }
    out.push({
      kind: "openapi",
      abs: resolvePath(getPackageRoot(), p.bundledSpecPath),
      label: p.id,
    });
  }
  return out;
}

/**
 * In a merged load, `specLabel` is each Google Cloud API slug from the bundled manifest (e.g. `container-v1`) or
 * one of these non-Google bundled vendor ids (`BUNDLED_PROVIDERS` keys; Google Cloud uses the manifest, not a single file here).
 */
export const BUNDLED_MERGED_VENDOR_LABELS: readonly string[] =
  Object.keys(BUNDLED_PROVIDERS).sort();

/**
 * Local document / conversion / archive / enterprise search stack. Omitted from the default **`all-providers`**
 * merge when **`CLAWQL_ENABLE_DOCUMENTS=0`**. **`CLAWQL_BUNDLED_PROVIDERS=…`** can still list these ids explicitly.
 */
export const BUNDLED_DOCUMENT_VENDOR_IDS: readonly string[] = [
  "gotenberg",
  "onyx",
  "paperless",
  "stirling",
  "tika",
];

const BUNDLED_DOCUMENT_VENDOR_SET = new Set(BUNDLED_DOCUMENT_VENDOR_IDS);

async function resolveAllBundledProvidersItems(): Promise<ProviderGroupItem[]> {
  const root = getPackageRoot();
  const google = await resolveGoogleTop50Items();
  const allowDocuments = getClawqlOptionalToolFlags().enableDocuments;
  const labels = BUNDLED_MERGED_VENDOR_LABELS.filter(
    (id) => allowDocuments || !BUNDLED_DOCUMENT_VENDOR_SET.has(id)
  );
  const rest: ProviderGroupItem[] = [];
  for (const id of labels) {
    const p = BUNDLED_PROVIDERS[id]!;
    if (isBundledGraphqlProvider(p)) {
      rest.push({
        kind: "graphql",
        label: p.id,
        endpoint: p.graphqlEndpoint,
        schemaAbs: resolvePath(root, p.bundledSchemaSdlPath),
        fallbackUrl: p.fallbackUrl,
      });
    } else {
      rest.push({
        kind: "openapi",
        abs: resolvePath(root, p.bundledSpecPath),
        label: p.id,
      });
    }
  }
  return [...google, ...rest];
}

export const BUNDLED_PROVIDER_GROUPS: Record<string, BundledProviderGroup> = {
  atlassian: { providers: ["jira", "bitbucket"] },
  /** Merged bundled Google Cloud APIs from `providers/google/google-top50-apis.json` (see providers docs). */
  google: { resolve: resolveGoogleTop50Items },
  /**
   * Google Cloud bundle + every other bundled vendor (Jira, Bitbucket, Cloudflare, GitHub, …).
   * The document stack (**tika**, **gotenberg**, **paperless**, **stirling**, **onyx**) is included unless **`CLAWQL_ENABLE_DOCUMENTS=0`**. Default when no spec env.
   */
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

const REMOVED_BUNDLED_PROVIDER_GROUP_IDS: Readonly<Record<string, string>> = {
  "default-multi-provider":
    "The default-multi-provider merge was removed. Use CLAWQL_BUNDLED_PROVIDERS (comma-separated ids) or CLAWQL_SPEC_PATHS, or all-providers / CLAWQL_PROVIDER=google, atlassian, all-providers. See README.",
};

export async function resolveBundledProviderGroup(
  raw: string | undefined
): Promise<ProviderGroupItem[] | undefined> {
  if (!raw?.trim()) return undefined;
  const key = raw.trim().toLowerCase();
  if (REMOVED_BUNDLED_PROVIDER_GROUP_IDS[key]) {
    throw new Error(REMOVED_BUNDLED_PROVIDER_GROUP_IDS[key]);
  }
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
    if (isBundledGraphqlProvider(p)) {
      return {
        kind: "graphql" as const,
        label: p.id,
        endpoint: p.graphqlEndpoint,
        schemaAbs: resolvePath(getPackageRoot(), p.bundledSchemaSdlPath),
        fallbackUrl: p.fallbackUrl,
      };
    }
    return {
      kind: "openapi" as const,
      abs: resolvePath(getPackageRoot(), p.bundledSpecPath),
      label: p.id,
    };
  });
}
