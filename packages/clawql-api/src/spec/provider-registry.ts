/**
 * Built-in providers: bundled OpenAPI / Discovery on disk + optional
 * pregenerated GraphQL artifacts (see scripts/providers/pregenerate-provider-graphql.ts), plus **GraphQL-only** vendors
 * (SDL on disk — e.g. Linear).
 */

import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { getClawqlOptionalToolFlags } from "../config/optional-flags.js";
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

function normalizeGraphqlEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  try {
    const u = new URL(trimmed);
    return `${u.origin}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

/** Match a custom GraphQL endpoint env value to a bundled provider (e.g. Linear). */
export function resolveBundledGraphqlByEndpoint(
  endpoint: string
): BundledGraphqlProvider | undefined {
  const target = normalizeGraphqlEndpoint(endpoint);
  for (const p of Object.values(BUNDLED_PROVIDERS)) {
    if (!isBundledGraphqlProvider(p)) continue;
    if (normalizeGraphqlEndpoint(p.graphqlEndpoint) === target) return p;
  }
  return undefined;
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
  /**
   * Notion REST API — official OpenAPI from developers.notion.com.
   * Auth: NOTION_API_TOKEN (Bearer integration token) + required Notion-Version header.
   */
  notion: {
    id: "notion",
    bundledSpecPath: "providers/notion/openapi.json",
    format: "openapi",
    fallbackUrl: "https://developers.notion.com/openapi.json",
    bundledIntrospectionPath: "providers/notion/introspection.json",
    bundledSchemaSdlPath: "providers/notion/schema.graphql",
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
   * n8n Public API (bundled spec extracted from Swagger UI; see scripts/providers/fetch-n8n-openapi.mjs).
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
  /**
   * Docling Serve — layout-aware document conversion (v1 REST API).
   * Base URL: DOCLING_BASE_URL. Auth: optional DOCLING_API_KEY → X-Api-Key.
   */
  docling: {
    id: "docling",
    bundledSpecPath: "providers/docling/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/docling/openapi.yaml",
  },
  /** Apache Tika server (JAX-RS). Base URL: TIKA_BASE_URL. */
  tika: {
    id: "tika",
    bundledSpecPath: "providers/tika/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/tika/openapi.yaml",
    bundledIntrospectionPath: "providers/tika/introspection.json",
    bundledSchemaSdlPath: "providers/tika/schema.graphql",
  },
  /** Gotenberg document conversion API. Base URL: GOTENBERG_BASE_URL. */
  gotenberg: {
    id: "gotenberg",
    bundledSpecPath: "providers/gotenberg/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/gotenberg/openapi.yaml",
    bundledIntrospectionPath: "providers/gotenberg/introspection.json",
    bundledSchemaSdlPath: "providers/gotenberg/schema.graphql",
  },
  /** Paperless-ngx REST (minimal bundled subset; refresh from /api/schema/). Base URL: PAPERLESS_BASE_URL. */
  paperless: {
    id: "paperless",
    bundledSpecPath: "providers/paperless/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/paperless/openapi.yaml",
    bundledIntrospectionPath: "providers/paperless/introspection.json",
    bundledSchemaSdlPath: "providers/paperless/schema.graphql",
  },
  /** Stirling-PDF (refresh `providers/stirling/openapi.yaml` via `npm run fetch-provider-specs` + `STIRLING_BASE_URL` → `/v1/api-docs`). Base URL for execute: `STIRLING_BASE_URL`. */
  stirling: {
    id: "stirling",
    bundledSpecPath: "providers/stirling/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/stirling/openapi.yaml",
    bundledIntrospectionPath: "providers/stirling/introspection.json",
    bundledSchemaSdlPath: "providers/stirling/schema.graphql",
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
  /** Nextcloud WebDAV + OCS (IDP storage). Base URL: NEXTCLOUD_BASE_URL. Auth: app password (Basic). */
  nextcloud: {
    id: "nextcloud",
    bundledSpecPath: "providers/nextcloud/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/nextcloud/openapi.yaml",
  },
  /** ConeShare secure sharing / VDR (IDP). Base URL: CONESHARE_BASE_URL. Auth: JWT Bearer. */
  coneshare: {
    id: "coneshare",
    bundledSpecPath: "providers/coneshare/openapi.yaml",
    format: "openapi",
    fallbackUrl:
      "https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/coneshare/openapi.yaml",
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

async function resolveAwsTop50Items(): Promise<ProviderGroupItem[]> {
  const root = getPackageRoot();
  const manifestPath = resolvePath(root, "providers/aws/aws-top50-apis.json");
  const text = await readFile(manifestPath, "utf-8");
  const data = JSON.parse(text) as { apis: Array<{ slug: string }> };
  if (!Array.isArray(data.apis)) {
    throw new Error("aws-top50-apis.json: expected apis[]");
  }
  return data.apis.map((a) => ({
    kind: "openapi" as const,
    abs: resolvePath(root, "providers/aws/apis", a.slug, "openapi.yaml"),
    label: a.slug,
  }));
}

/**
 * Build a merged load from a comma/semicolon/newline-separated list of **bundled** ids
 * (keys of **`BUNDLED_PROVIDERS`**, case-insensitive) and/or **`google`** / **`aws`** (manifest-backed cloud bundles).
 * Use **`CLAWQL_BUNDLED_PROVIDERS`** in `spec-loader`; there is no other default
 * custom merge — only this list, path list, or **`all-providers`**.
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
    if (part === "google-top50") {
      throw new Error(
        "The google-top50 id was removed in 7.0.0. Use google in CLAWQL_BUNDLED_PROVIDERS."
      );
    }
    const id = part;
    if (id === "google") {
      for (const g of await resolveGoogleTop50Items()) {
        if (seen.has(g.label)) continue;
        seen.add(g.label);
        out.push(g);
      }
      continue;
    }
    if (id === "aws") {
      for (const a of await resolveAwsTop50Items()) {
        if (seen.has(a.label)) continue;
        seen.add(a.label);
        out.push(a);
      }
      continue;
    }
    const p = BUNDLED_PROVIDERS[id];
    if (!p) {
      const valid = [...Object.keys(BUNDLED_PROVIDERS), "google", "aws"].sort().join(", ");
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
  "coneshare",
  "docling",
  "gotenberg",
  "nextcloud",
  "onyx",
  "paperless",
  "stirling",
  "tika",
];

const BUNDLED_DOCUMENT_VENDOR_SET = new Set(BUNDLED_DOCUMENT_VENDOR_IDS);

/**
 * Opinionated default install stack — framework-style curated merge when no spec env is set.
 * **`CLAWQL_PROVIDER=default`** / **`default-providers`** resolves the same list (plus optional cloud add-ons).
 */
export const DEFAULT_BUNDLED_PROVIDER_IDS: readonly string[] = [
  "cloudflare",
  "github",
  "slack",
  "linear",
  "notion",
  "onyx",
];

/**
 * Default bundled merge when no spec env is set: **`DEFAULT_BUNDLED_PROVIDER_IDS`**, minus Cloudflare when
 * **`CLAWQL_ENABLE_CLOUDFLARE=0`**, plus **`google`** / **`aws`** when **`CLAWQL_ENABLE_GOOGLE`** /
 * **`CLAWQL_ENABLE_AWS`** are set. Does not respect **`CLAWQL_ENABLE_DOCUMENTS`** (Onyx stays in the default stack).
 */
export async function resolveDefaultBundledProvidersItems(): Promise<ProviderGroupItem[]> {
  const flags = getClawqlOptionalToolFlags();
  const ids = DEFAULT_BUNDLED_PROVIDER_IDS.filter((id) => {
    if (id === "cloudflare" && !flags.enableCloudflare) return false;
    return true;
  });
  const parts = [...ids];
  if (flags.enableGoogle) parts.push("google");
  if (flags.enableAws) parts.push("aws");
  if (parts.length === 0) return [];
  return resolveItemsFromBundledProviderEnvList(parts.join(","));
}

async function resolveAllBundledProvidersItems(): Promise<ProviderGroupItem[]> {
  const root = getPackageRoot();
  const flags = getClawqlOptionalToolFlags();
  const cloud: ProviderGroupItem[] = [
    ...(await resolveGoogleTop50Items()),
    ...(await resolveAwsTop50Items()),
  ];
  const allowDocuments = flags.enableDocuments;
  const labels = BUNDLED_MERGED_VENDOR_LABELS.filter((id) => {
    if (!allowDocuments && BUNDLED_DOCUMENT_VENDOR_SET.has(id)) return false;
    return true;
  });
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
  return [...cloud, ...rest];
}

export const BUNDLED_PROVIDER_GROUPS: Record<string, BundledProviderGroup> = {
  atlassian: { providers: ["jira", "bitbucket"] },
  /** Merged bundled Google Cloud APIs from `providers/google/google-top50-apis.json` (see providers docs). */
  google: { resolve: resolveGoogleTop50Items },
  /** Merged bundled AWS APIs from `providers/aws/aws-top50-apis.json` (see providers docs). */
  aws: { resolve: resolveAwsTop50Items },
  /**
   * Opinionated default stack (same as no-config install). Cloud add-ons via **`CLAWQL_ENABLE_GOOGLE`** /
   * **`CLAWQL_ENABLE_AWS`**; omit Cloudflare with **`CLAWQL_ENABLE_CLOUDFLARE=0`**.
   */
  default: { resolve: resolveDefaultBundledProvidersItems },
  "default-providers": { resolve: resolveDefaultBundledProvidersItems },
  /**
   * Literally every bundled vendor plus Google top-50 and AWS top-50. Only **`CLAWQL_ENABLE_DOCUMENTS=0`**
   * trims the document/IDP stack. Opt in with **`CLAWQL_PROVIDER=all-providers`** — not the no-config default.
   */
  "all-providers": { resolve: resolveAllBundledProvidersItems },
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
    "The default-multi-provider merge was removed. Use CLAWQL_BUNDLED_PROVIDERS (comma-separated ids) or CLAWQL_SPEC_PATHS, or all-providers / CLAWQL_PROVIDER=google / aws / atlassian / all-providers. See README.",
  "google-top50":
    "The google-top50 preset id was removed in 7.0.0. Use CLAWQL_PROVIDER=google or CLAWQL_BUNDLED_PROVIDERS=google.",
};

export async function resolveBundledProviderGroup(
  raw: string | undefined
): Promise<ProviderGroupItem[] | undefined> {
  if (!raw?.trim()) return undefined;
  const key = raw.trim().toLowerCase();
  if (REMOVED_BUNDLED_PROVIDER_GROUP_IDS[key]) {
    throw new Error(REMOVED_BUNDLED_PROVIDER_GROUP_IDS[key]);
  }
  const canonical = key;
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
