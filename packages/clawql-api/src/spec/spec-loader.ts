/**
 * spec-loader.ts
 *
 * Loads an API description from:
 * - Local file (JSON or YAML OpenAPI 3 / Swagger 2), or
 * - URL to fetch the same, or
 * - Google Discovery document URL, or
 * - **Opt-in** bundled packs via instance `providers` (`pack` / `enabled`) or legacy
 *   **`CLAWQL_PROVIDER`** / **`CLAWQL_BUNDLED_PROVIDERS`** / **`CLAWQL_SPEC_PATHS`**.
 * - **No-config default:** empty provider stack (native GraphQL/gRPC only when configured) —
 *   catalog stays available; nothing is auto-loaded.
 *
 * Curated pack **`default`** = Cloudflare, GitHub, Slack, Linear, Notion, Onyx.
 * **`all-providers`** = every bundled vendor plus GCP and AWS manifests.
 *
 * Produces a flattened Operation list for search + OpenAPI 3 for GraphQL.
 */

import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { Effect } from "effect";
import fetch from "node-fetch";
import { parse as parseYaml } from "yaml";
import { isAwsSpecLabelEffect, resolveAwsApiBaseUrlEffect } from "../auth/aws-auth.js";
import { convertObj } from "swagger2openapi";
import type { Operation, ParameterInfo } from "./operation-types.js";
import { loadGraphqlNativeOperationsFromConfigs } from "./graphql-native-loader.js";
import { mergeNativeProtocolOperations } from "./native-protocol-merge.js";
import {
  shouldLoadCustomProvidersOnly,
  resolveBundledGraphqlFromCustomEnv,
} from "./native-protocol-env.js";
import { resetNativeProtocolRegistry } from "./native-protocol-registry.js";
import { resetMcpSourceRegistry } from "./mcp-source-registry.js";
import { operationsFromOpenAPI } from "./openapi-operations.js";
import { getPackageRoot } from "./package-root.js";
import {
  isEmptyProvidersComposition,
  readProvidersCompositionFromEnv,
  type ClawqlProvidersComposition,
} from "../config/providers-composition.js";
import {
  listBundledProviderGroupIds,
  listBundledProviderIds,
  isBundledGraphqlProvider,
  resolveBundledProvider,
  resolveBundledProviderGroup,
  resolveItemsFromBundledProviderEnvList,
  type BundledGraphqlProvider,
  type BundledOpenApiProvider,
  type ProviderGroupItem,
} from "./provider-registry.js";

export type { Operation, ParameterInfo } from "./operation-types.js";

/** Default bundled provider id used by the single-provider fallback path. */
export const DEFAULT_PROVIDER_ID = "cloudflare";

export interface LoadedSpec {
  operations: Operation[];
  /** Original document (Discovery or OpenAPI) for debugging. */
  rawSource: Record<string, unknown>;
  openapi: OpenAPIDoc;
  /**
   * When `multi` is true, one OpenAPI doc per loaded file (same order as operations' `specIndex`).
   * `openapi` remains the first document (GraphQL proxy / legacy callers).
   */
  openapis?: OpenAPIDoc[];
  /** Multiple Discovery/OpenAPI files merged into one operation index; execute uses REST per spec. */
  multi?: boolean;
}

// Minimal typings for the Google Discovery format
interface DiscoveryDoc {
  title?: string;
  version?: string;
  rootUrl: string;
  servicePath: string;
  resources: Record<string, DiscoveryResource>;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DiscoveryResource {
  methods?: Record<string, DiscoveryMethod>;
  resources?: Record<string, DiscoveryResource>;
}

interface DiscoveryMethod {
  id: string;
  httpMethod: string;
  path: string;
  /** Some APIs (e.g. Cloud Storage) omit this; `path` is used instead. */
  flatPath?: string;
  description?: string;
  parameters?: Record<string, DiscoveryParam>;
  scopes?: string[];
  request?: { $ref: string };
  response?: { $ref: string };
}

interface DiscoveryParam {
  type: string;
  location: string;
  required?: boolean;
  description?: string;
}

// Minimal OpenAPI typings
export interface OpenAPIDoc {
  openapi: string;
  info: { title: string; version: string };
  /** Optional for some specs; use CLAWQL_API_BASE_URL if missing. */
  servers?: { url: string }[];
  paths: Record<string, unknown>;
  webhooks?: Record<string, unknown>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

const DISCOVERY_SCHEMA_METADATA_KEYS = new Set(["id", "enumDescriptions", "enumDeprecated"]);

export function sanitizeSchemaNode(value: unknown, inPropertiesMap = false): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSchemaNode(item, false));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(input)) {
    if (DISCOVERY_SCHEMA_METADATA_KEYS.has(key) && (!inPropertiesMap || key !== "id")) {
      continue;
    }
    if (key === "type" && child === "any") {
      continue;
    }
    if (key === "$ref" && typeof child === "string") {
      if (child.startsWith("#/")) {
        output[key] = child;
      } else if (child.startsWith("#")) {
        output[key] = `#/${child.slice(1).replace(/^\/+/, "")}`;
      } else {
        output[key] = `#/components/schemas/${child}`;
      }
      continue;
    }
    output[key] = sanitizeSchemaNode(child, key === "properties");
  }

  return output;
}

/** Full OpenAPI normalization pipeline (used by `loadSpec` / scripts). Exported for tests. */
export function sanitizeOpenAPIDocument(doc: OpenAPIDoc): OpenAPIDoc {
  const normalized = normalizeWildcardResponseKeysInDoc(sanitizeOpenAPIObject(doc)) as OpenAPIDoc;
  ensureReferencedSecuritySchemesExist(normalized);
  const components = normalized.components ?? { schemas: {} };
  const serverOverride = process.env.CLAWQL_API_BASE_URL;
  const filteredServers = (normalized.servers ?? []).filter(
    (s) => typeof s?.url === "string" && s.url.trim().length > 0
  );
  const servers =
    filteredServers.length > 0
      ? filteredServers
      : serverOverride
        ? [{ url: serverOverride }]
        : undefined;
  return {
    ...normalized,
    ...(servers ? { servers } : {}),
    components: {
      ...components,
      schemas: sanitizeSchemaNode(components.schemas ?? {}) as Record<string, unknown>,
    },
  };
}

/**
 * OpenAPI 3.1-style wildcard responses use `4xx` / `5xx`; oas-validator only accepts
 * `4XX` / `5XX` (see oas-validator `^[1-5](?:\\d{2}|XX)$`). Cloudflare's published
 * OpenAPI uses lowercase — normalize so the GraphQL layer (Omnigraph) can load the spec.
 */
function normalizeWildcardResponseKeysInDoc(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => normalizeWildcardResponseKeysInDoc(v));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    let next = v;
    if (k === "responses" && v && typeof v === "object" && !Array.isArray(v)) {
      const r = v as Record<string, unknown>;
      const renamed: Record<string, unknown> = {};
      for (const [code, resp] of Object.entries(r)) {
        let c = code;
        if (code === "4xx") c = "4XX";
        else if (code === "5xx") c = "5XX";
        renamed[c] = resp;
      }
      next = renamed;
    }
    out[k] = normalizeWildcardResponseKeysInDoc(next);
  }
  return out;
}

/**
 * Some published specs (e.g. Cloudflare) reference a `security` scheme in operations
 * but omit it from `components.securitySchemes`. oas-validator rejects unresolved refs.
 * Inject a minimal HTTP bearer stub for any referenced name that is missing.
 */
function ensureReferencedSecuritySchemesExist(openapi: OpenAPIDoc): void {
  const schemes =
    (openapi.components?.securitySchemes as Record<string, unknown> | undefined) ?? {};
  const defined = new Set(Object.keys(schemes));
  const used = new Set<string>();

  function walkSecurity(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walkSecurity(item);
      return;
    }
    const rec = value as Record<string, unknown>;
    if (Array.isArray(rec.security)) {
      for (const req of rec.security) {
        if (req && typeof req === "object") {
          for (const k of Object.keys(req as object)) used.add(k);
        }
      }
    }
    for (const v of Object.values(rec)) walkSecurity(v);
  }

  walkSecurity(openapi.paths);
  if (openapi.webhooks) walkSecurity(openapi.webhooks);

  for (const name of used) {
    if (!defined.has(name)) {
      schemes[name] = {
        type: "http",
        scheme: "bearer",
        description:
          "Referenced by the OpenAPI document but missing from components.securitySchemes; " +
          "ClawQL adds this stub so validators and the GraphQL layer can load the spec.",
      };
      defined.add(name);
    }
  }

  if (!openapi.components) {
    openapi.components = { schemas: {} };
  }
  openapi.components.securitySchemes = schemes as typeof openapi.components.securitySchemes;
}

/** Deep normalization for quirks in large third-party OpenAPI docs (see sanitizeOpenAPIDocument). */
export function sanitizeOpenAPIObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeOpenAPIObject(v));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (key === "items" && typeof child === "string") {
      // Some specs use shorthand items: "string"; normalize to valid schema object.
      output[key] = { type: child };
      continue;
    }
    output[key] = sanitizeOpenAPIObject(child);
  }
  // JSON Schema / OpenAPI: `default: null` with a non-null `type` must pair with
  // `nullable: true`. Real specs (e.g. Jira) omit nullable; oas-validator then
  // compares typeof default ("object" in JS) to type name and throws.
  if ("default" in output && output.default === null && output.nullable !== true) {
    output.nullable = true;
  }
  return output;
}

function hasApiBaseUrlOverride(): boolean {
  return !!process.env.CLAWQL_API_BASE_URL?.trim();
}

/**
 * Specs loaded from a URL may list a path-only server (e.g. `/api/v3`).
 * Resolve against the document URL origin so REST/GraphQL targets are absolute.
 */
function absolutizeRelativeOpenApiServers(openapi: OpenAPIDoc, documentUrl: string): void {
  const servers = openapi.servers;
  if (!servers?.length) return;
  let originNoSlash: string;
  try {
    originNoSlash = new URL(documentUrl).origin.replace(/\/$/, "");
  } catch {
    return;
  }
  for (const s of servers) {
    if (typeof s.url !== "string") continue;
    const u = s.url.trim();
    if (u.startsWith("//")) {
      try {
        const proto = new URL(documentUrl).protocol;
        s.url = new URL(`${proto}${u}`).toString().replace(/\/$/, "");
      } catch {
        /* keep */
      }
      continue;
    }
    if (u.startsWith("/")) {
      s.url = `${originNoSlash}${u}`.replace(/\/$/, "");
      continue;
    }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) {
      try {
        s.url = new URL(u, documentUrl).toString().replace(/\/$/, "");
      } catch {
        /* keep */
      }
    }
  }
}

// ─────────────────────────────────────────────
// Spec source config (env)
// ─────────────────────────────────────────────

type SpecSource =
  | { kind: "file"; path: string }
  | { kind: "url"; url: string }
  | { kind: "discovery"; url: string }
  | { kind: "bundled"; entry: BundledOpenApiProvider }
  | { kind: "bundled-graphql"; entry: BundledGraphqlProvider }
  | { kind: "default" };

function resolveSpecSource(): SpecSource {
  const filePath =
    process.env.CLAWQL_SPEC_PATH || process.env.OPENAPI_SPEC_PATH || process.env.OPENAPI_FILE;
  const specUrl = process.env.CLAWQL_SPEC_URL;
  const discoveryUrl = process.env.CLAWQL_DISCOVERY_URL;
  const providerRaw = process.env.CLAWQL_PROVIDER;

  if (filePath) return { kind: "file", path: filePath };
  if (specUrl) return { kind: "url", url: specUrl };
  if (discoveryUrl) return { kind: "discovery", url: discoveryUrl };

  const bundled = resolveBundledProvider(providerRaw);
  if (bundled) {
    if (isBundledGraphqlProvider(bundled)) return { kind: "bundled-graphql", entry: bundled };
    return { kind: "bundled", entry: bundled };
  }
  if (providerRaw?.trim()) {
    throw new Error(
      `Unknown CLAWQL_PROVIDER="${providerRaw.trim()}". ` +
        `Single: ${listBundledProviderIds().join(", ")}. ` +
        `Merged presets: ${listBundledProviderGroupIds().join(", ")}`
    );
  }

  // Should not be reached when resolveMultiSpecItems returns "empty" first.
  return { kind: "default" };
}

function parseSpecText(text: string): unknown {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    return JSON.parse(t) as unknown;
  }
  return parseYaml(t) as unknown;
}

function isSwagger2(obj: unknown): boolean {
  return (
    typeof obj === "object" && obj !== null && (obj as Record<string, unknown>).swagger === "2.0"
  );
}

function isDiscoveryDoc(obj: unknown): obj is DiscoveryDoc {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.rootUrl === "string" && o.resources != null && !("openapi" in o) && !("swagger" in o)
  );
}

function isOpenAPI3(obj: unknown): obj is OpenAPIDoc {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return typeof o.openapi === "string" && o.openapi.startsWith("3");
}

/** When set, bundled providers never fetch the fallback URL if the local file is missing. */
function bundledOfflineNoRemoteFetch(): boolean {
  const v = process.env.CLAWQL_BUNDLED_OFFLINE?.trim();
  return v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "yes";
}

async function loadRawDocument(source: SpecSource): Promise<unknown> {
  switch (source.kind) {
    case "bundled": {
      const root = getPackageRoot();
      const abs = resolvePath(root, source.entry.bundledSpecPath);
      console.error(`[spec-loader] bundled provider "${source.entry.id}" → ${abs}`);
      try {
        const text = await readFile(abs, "utf-8");
        console.error(`[spec-loader] Using bundled local OpenAPI (no network): ${abs}`);
        return parseSpecText(text);
      } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException;
        if (err?.code !== "ENOENT") throw e;
        if (bundledOfflineNoRemoteFetch()) {
          throw new Error(
            `Bundled spec file missing: ${abs}. ` +
              `Run \`npm run fetch-provider-specs\` or clear CLAWQL_BUNDLED_OFFLINE.`,
            { cause: e }
          );
        }
        console.error(
          `[spec-loader] Bundled file missing; fetching fallback: ${source.entry.fallbackUrl}`
        );
        const res = await fetch(source.entry.fallbackUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch provider fallback (${source.entry.id}): ${res.status}`, {
            cause: e,
          });
        }
        return parseSpecText(await res.text());
      }
    }
    case "default": {
      throw new Error(
        '[spec-loader] Internal error: empty provider stack should resolve via multi-spec "empty" path, not single-spec default.'
      );
    }
    case "discovery": {
      console.error(`[spec-loader] discovery URL: ${source.url}`);
      const res = await fetch(source.url);
      if (!res.ok) throw new Error(`Failed to fetch discovery: ${res.status}`);
      const text = await res.text();
      return parseSpecText(text);
    }
    case "url": {
      console.error(`[spec-loader] OpenAPI URL: ${source.url}`);
      const res = await fetch(source.url);
      if (!res.ok) throw new Error(`Failed to fetch OpenAPI: ${res.status}`);
      const text = await res.text();
      return parseSpecText(text);
    }
    case "file": {
      const abs = resolvePath(process.cwd(), source.path);
      console.error(`[spec-loader] OpenAPI file: ${abs}`);
      const text = await readFile(abs, "utf-8");
      return parseSpecText(text);
    }
  }
}

async function normalizeToOpenAPI(raw: unknown): Promise<unknown> {
  if (isSwagger2(raw)) {
    const { openapi } = await convertObj(raw as object, {
      patch: true,
      /** e.g. Slack Web API spec uses JSON Schema unions Slack’s own generator emits. */
      warnOnly: true,
    });
    return openapi;
  }
  return raw;
}

async function buildLoadedSpec(raw: unknown): Promise<LoadedSpec> {
  const doc = await normalizeToOpenAPI(raw);

  if (isDiscoveryDoc(doc)) {
    const discovery = doc;
    const operations = flattenOperations(discovery.resources, []);
    const openapi = discoveryToOpenAPI(discovery, operations);
    return {
      operations,
      rawSource: discovery as Record<string, unknown>,
      openapi,
    };
  }

  if (!isOpenAPI3(doc)) {
    throw new Error(
      "Unsupported document: expected OpenAPI 3.x, Swagger 2.x, or Google Discovery (rootUrl + resources)."
    );
  }

  const openapi = sanitizeOpenAPIDocument(doc);
  const operations = operationsFromOpenAPI(openapi);
  return {
    operations,
    rawSource: openapi as unknown as Record<string, unknown>,
    openapi,
  };
}

/**
 * Load a local OpenAPI / Discovery / Swagger file by absolute path (build scripts).
 */
export async function loadOpenAPIFromAbsolutePath(absolutePath: string): Promise<LoadedSpec> {
  const text = await readFile(absolutePath, "utf-8");
  const raw = parseSpecText(text);
  return buildLoadedSpec(raw);
}

// ─────────────────────────────────────────────
// Multi-spec (merged operation index, REST per operation)
// ─────────────────────────────────────────────

/** Load native GraphQL ops from a vendored SDL path, or fetch **`fallbackUrl`** when the file is missing. */
async function loadBundledGraphqlOperationsFromDiskOrFallback(opts: {
  label: string;
  endpoint: string;
  schemaAbs: string;
  fallbackUrl: string;
}): Promise<Operation[]> {
  try {
    await readFile(opts.schemaAbs, "utf-8");
    return loadGraphqlNativeOperationsFromConfigs([
      { name: opts.label, endpoint: opts.endpoint, schemaPath: opts.schemaAbs },
    ]);
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code !== "ENOENT") throw e;
    if (bundledOfflineNoRemoteFetch()) {
      throw new Error(
        `Bundled GraphQL schema missing: ${opts.schemaAbs}. ` +
          `Run \`npm run fetch-linear-schema\` or clear CLAWQL_BUNDLED_OFFLINE.`,
        { cause: e }
      );
    }
    console.error(`[spec-loader] Bundled GraphQL schema missing; fetching: ${opts.fallbackUrl}`);
    const res = await fetch(opts.fallbackUrl);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Failed to fetch GraphQL schema fallback (${opts.label}): ${res.status}`, {
        cause: e,
      });
    }
    return loadGraphqlNativeOperationsFromConfigs([
      { name: opts.label, endpoint: opts.endpoint, schemaContent: text },
    ]);
  }
}

async function loadBundledGraphqlShellSpec(entry: BundledGraphqlProvider): Promise<LoadedSpec> {
  const root = getPackageRoot();
  const schemaAbs = resolvePath(root, entry.bundledSchemaSdlPath);
  const ops = await loadBundledGraphqlOperationsFromDiskOrFallback({
    label: entry.id,
    endpoint: entry.graphqlEndpoint,
    schemaAbs,
    fallbackUrl: entry.fallbackUrl,
  });
  const stub = buildStubLoadedSpec();
  return {
    ...stub,
    operations: ops,
    rawSource: {
      ...stub.rawSource,
      bundledGraphqlProvider: entry.id,
      graphqlEndpoint: entry.graphqlEndpoint,
    } as Record<string, unknown>,
  };
}

/** Derive a short label from a spec path (e.g. .../compute-v1/discovery.json → compute-v1). */
export function labelFromSpecPath(relOrAbs: string): string {
  const normalized = relOrAbs.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "spec";
  if (
    last === "discovery.json" ||
    last.endsWith(".json") ||
    last.endsWith(".yaml") ||
    last.endsWith(".yml")
  ) {
    const parent = parts[parts.length - 2];
    if (parent) return parent;
  }
  return last.replace(/\.(yaml|yml|json)$/i, "");
}

async function resolveItemsFromProvidersComposition(
  composition: ClawqlProvidersComposition
): Promise<ProviderGroupItem[]> {
  if (isEmptyProvidersComposition(composition)) return [];

  const pack = composition.pack?.trim().toLowerCase();
  const enabled = (composition.enabled ?? []).map((s) => s.trim()).filter(Boolean);
  const parts: ProviderGroupItem[] = [];

  if (pack && pack !== "none") {
    const grouped = await resolveBundledProviderGroup(pack);
    if (!grouped) {
      throw new Error(
        `Unknown providers.pack="${composition.pack}". ` +
          `Known packs: none, ${listBundledProviderGroupIds().join(", ")}`
      );
    }
    parts.push(...grouped);
  }

  if (enabled.length > 0) {
    parts.push(...(await resolveItemsFromBundledProviderEnvList(enabled.join(","))));
  }

  // De-dupe by label (pack + enabled may overlap)
  const seen = new Set<string>();
  const out: ProviderGroupItem[] = [];
  for (const item of parts) {
    if (seen.has(item.label)) continue;
    seen.add(item.label);
    out.push(item);
  }
  return out;
}

/**
 * Multi-spec resolution.
 * - `ProviderGroupItem[]` — load those specs
 * - `"empty"` — no bundled providers (stub + native protocols)
 * - `null` — fall through to single-spec `resolveSpecSource()`
 */
async function resolveMultiSpecItems(): Promise<ProviderGroupItem[] | "empty" | null> {
  const filePath =
    process.env.CLAWQL_SPEC_PATH || process.env.OPENAPI_SPEC_PATH || process.env.OPENAPI_FILE;
  const specUrl = process.env.CLAWQL_SPEC_URL;
  const discoveryUrl = process.env.CLAWQL_DISCOVERY_URL;
  const providerRaw = process.env.CLAWQL_PROVIDER?.trim().toLowerCase();
  const pathsEnv = process.env.CLAWQL_SPEC_PATHS?.trim();
  const bundledListEnv = process.env.CLAWQL_BUNDLED_PROVIDERS?.trim();

  if (pathsEnv) {
    const parts = pathsEnv
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.map((p) => ({
      kind: "openapi" as const,
      abs: resolvePath(process.cwd(), p),
      label: labelFromSpecPath(p),
    }));
  }
  if (bundledListEnv) {
    return await resolveItemsFromBundledProviderEnvList(bundledListEnv);
  }

  const fromInstance = readProvidersCompositionFromEnv();
  if (fromInstance !== undefined) {
    const items = await resolveItemsFromProvidersComposition(fromInstance);
    return items.length === 0 ? "empty" : items;
  }

  if (providerRaw) {
    if (providerRaw === "none") return "empty";
    const grouped = await resolveBundledProviderGroup(providerRaw);
    if (grouped) return grouped;
  }

  // Deprecated env add-ons alone no longer imply the curated pack.
  if (
    process.env.CLAWQL_ENABLE_GOOGLE?.trim() ||
    process.env.CLAWQL_ENABLE_AWS?.trim() ||
    process.env.CLAWQL_ENABLE_CLOUDFLARE?.trim()
  ) {
    console.error(
      "[spec-loader] CLAWQL_ENABLE_GOOGLE|AWS|CLOUDFLARE no longer select the provider stack. " +
        "Use providers.pack / providers.enabled in CLAWQL_INSTANCE_SPEC, or CLAWQL_PROVIDER=default|google|aws|…"
    );
  }

  // No config: slim server — catalog available, nothing loaded.
  if (!filePath && !specUrl && !discoveryUrl && !providerRaw) {
    return "empty";
  }
  return null;
}

async function loadMultiSpecFromItems(items: ProviderGroupItem[]): Promise<LoadedSpec> {
  if (items.length === 0) {
    throw new Error("Multi-spec: no spec paths resolved.");
  }

  const openapis: OpenAPIDoc[] = [];
  const allOps: Operation[] = [];
  const seenIds = new Set<string>();
  const sources: unknown[] = [];

  const emptyOpenApiShell = (title: string): OpenAPIDoc => ({
    openapi: "3.0.0",
    info: { title, version: "0" },
    paths: {},
    components: { schemas: {} },
  });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "graphql") {
      console.error(
        `[spec-loader] multi ${i + 1}/${items.length}: ${item.label} → GraphQL ${item.endpoint} (schema ${item.schemaAbs})`
      );
      const gqlOps = await loadBundledGraphqlOperationsFromDiskOrFallback({
        label: item.label,
        endpoint: item.endpoint,
        schemaAbs: item.schemaAbs,
        fallbackUrl: item.fallbackUrl,
      });
      openapis.push(emptyOpenApiShell(`GraphQL: ${item.label}`));
      sources.push({
        graphql: item.label,
        endpoint: item.endpoint,
        schemaPath: item.schemaAbs,
      });
      for (const op of gqlOps) {
        let id = op.id;
        if (seenIds.has(id)) {
          id = `${item.label}::${op.id}`;
        }
        seenIds.add(id);
        allOps.push({
          ...op,
          id,
          specIndex: i,
          specLabel: item.label,
        });
      }
      continue;
    }

    const { abs, label } = item;
    console.error(`[spec-loader] multi ${i + 1}/${items.length}: ${label} → ${abs}`);
    const text = await readFile(abs, "utf-8");
    const raw = parseSpecText(text);
    const loaded = await buildLoadedSpec(raw);
    openapis.push(loaded.openapi);
    sources.push(loaded.rawSource);

    for (const op of loaded.operations) {
      let id = op.id;
      if (seenIds.has(id)) {
        id = `${label}::${op.id}`;
      }
      seenIds.add(id);
      allOps.push({
        ...op,
        id,
        specIndex: i,
        specLabel: label,
      });
    }
  }

  return {
    operations: allOps,
    openapis,
    openapi: openapis[0],
    multi: true,
    rawSource: {
      multi: true,
      count: items.length,
      labels: items.map((x) => x.label),
      sources,
    } as Record<string, unknown>,
  };
}

/** Minimal OpenAPI-shaped shell when only **`CLAWQL_GRAPHQL_*`** / **`CLAWQL_GRPC_SOURCES`** are set (no REST spec env). */
function buildStubLoadedSpec(): LoadedSpec {
  const openapi: OpenAPIDoc = {
    openapi: "3.0.0",
    info: { title: "ClawQL native protocols only", version: "0" },
    paths: {},
    components: { schemas: {} },
  };
  return {
    operations: [],
    rawSource: { stub: true, kind: "native-protocols-only" },
    openapi,
  };
}

// ─────────────────────────────────────────────
// Fetch + cache
// ─────────────────────────────────────────────

let cachedSpec: LoadedSpec | null = null;
/** Coalesce concurrent `loadSpec()` calls so env is read once (avoids parallel all-providers loads in tests). */
let loadInFlight: Promise<LoadedSpec> | null = null;
/** Bumped on `resetSpecCache()` so in-flight loads from a prior env snapshot cannot repopulate the cache. */
let loadGeneration = 0;

export function resetSpecCache(): void {
  cachedSpec = null;
  loadInFlight = null;
  loadGeneration++;
  resetNativeProtocolRegistry();
  resetMcpSourceRegistry();
}

let specCacheShutdownHooksRegistered = false;

/** Close native gRPC clients and drop cached spec when the process exits (containers / SIGTERM). */
export function registerSpecCacheShutdownHooks(): void {
  if (specCacheShutdownHooksRegistered) return;
  specCacheShutdownHooksRegistered = true;
  const flush = (): void => {
    resetSpecCache();
  };
  process.once("SIGINT", flush);
  process.once("SIGTERM", flush);
}

async function loadSpecUncached(): Promise<LoadedSpec> {
  if (shouldLoadCustomProvidersOnly()) {
    const bundled = resolveBundledGraphqlFromCustomEnv();
    if (bundled) {
      const loaded = await loadBundledGraphqlShellSpec(bundled);
      console.error(
        `[spec-loader] Loaded provider "${bundled.id}" (${loaded.operations.length} operations)`
      );
      return loaded;
    }

    const stub = buildStubLoadedSpec();
    const loaded = await mergeNativeProtocolOperations(stub);
    if (loaded.operations.length === 0) {
      throw new Error(
        "[spec-loader] Could not load the provider(s) configured via CLAWQL_GRAPHQL_* / CLAWQL_GRPC_SOURCES. " +
          "Check endpoints, credentials, and on-disk schema/proto paths. " +
          "For bundled providers use providers.pack / CLAWQL_PROVIDER (e.g. linear + LINEAR_API_KEY). " +
          "With no provider config, only native protocols are loaded (no bundled OpenAPI catalog)."
      );
    }
    console.error(
      `[spec-loader] Loaded ${loaded.operations.length} operations from custom provider endpoint(s)`
    );
    return loaded;
  }

  const multiItems = await resolveMultiSpecItems();
  if (multiItems === "empty") {
    const stub = buildStubLoadedSpec();
    const loaded = await mergeNativeProtocolOperations(stub);
    console.error(
      `[spec-loader] No providers configured — native protocols only (${loaded.operations.length} operation(s)). ` +
        `Opt in with providers.pack / providers.enabled in CLAWQL_INSTANCE_SPEC, or CLAWQL_PROVIDER / CLAWQL_BUNDLED_PROVIDERS.`
    );
    return loaded;
  }
  if (multiItems) {
    const merged = await loadMultiSpecFromItems(multiItems);
    const loaded = await mergeNativeProtocolOperations(merged);
    console.error(
      `[spec-loader] Multi-spec: ${multiItems.length} APIs merged → ${loaded.operations.length} operations (REST for OpenAPI; native GraphQL/gRPC when configured)`
    );
    return loaded;
  }

  const source = resolveSpecSource();
  if (source.kind === "bundled-graphql") {
    const built = await loadBundledGraphqlShellSpec(source.entry);
    const loaded = await mergeNativeProtocolOperations(built);
    console.error(
      `[spec-loader] Bundled GraphQL provider "${source.entry.id}": ${loaded.operations.length} operations → ${source.entry.graphqlEndpoint}`
    );
    return loaded;
  }

  const raw = await loadRawDocument(source);
  const built = await buildLoadedSpec(raw);
  if (source.kind === "url" && !hasApiBaseUrlOverride()) {
    absolutizeRelativeOpenApiServers(built.openapi, source.url);
  }

  const loaded = await mergeNativeProtocolOperations(built);
  console.error(
    `[spec-loader] Loaded ${loaded.operations.length} operations (${built.openapi.info?.title ?? "API"})`
  );
  return loaded;
}

export async function loadSpec(): Promise<LoadedSpec> {
  if (cachedSpec) return cachedSpec;
  const generation = loadGeneration;
  if (!loadInFlight) {
    loadInFlight = loadSpecUncached()
      .then((loaded) => {
        if (generation === loadGeneration) {
          cachedSpec = loaded;
        }
        return loaded;
      })
      .finally(() => {
        if (generation === loadGeneration) {
          loadInFlight = null;
        }
      });
  }
  return loadInFlight;
}

/**
 * Self-hosted document / conversion APIs: base URL per merged `specLabel`
 * (see GitHub #111). When unset, `servers[0].url` from the bundled spec is used.
 */
export function resolveBundledSelfHostedBaseUrl(specLabel?: string): string | undefined {
  const label = specLabel?.trim().toLowerCase();
  if (!label) return undefined;
  const envByLabel: Record<string, string> = {
    docling: "DOCLING_BASE_URL",
    paperless: "PAPERLESS_BASE_URL",
    stirling: "STIRLING_BASE_URL",
    tika: "TIKA_BASE_URL",
    gotenberg: "GOTENBERG_BASE_URL",
    onyx: "ONYX_BASE_URL",
    nextcloud: "NEXTCLOUD_BASE_URL",
    coneshare: "CONESHARE_BASE_URL",
  };
  const envKey = envByLabel[label];
  if (!envKey) return undefined;
  const v = process.env[envKey]?.trim();
  return v ? v.replace(/\/$/, "") : undefined;
}

/**
 * Resolve REST base URL for the GraphQL proxy.
 * Per-provider self-hosted URLs (PAPERLESS_BASE_URL, …) win for merged `specLabel`.
 * Then CLAWQL_API_BASE_URL, then OpenAPI `servers[0]`.
 */
/**
 * Base URL resolution for `execute`: uses the operation's merged `specLabel`, or
 * **`CLAWQL_PROVIDER`** in single-spec mode (where `specLabel` is unset).
 */
export function resolveApiBaseUrlForOperation(
  openapi: OpenAPIDoc,
  op: { specLabel?: string }
): string {
  const label =
    op.specLabel?.trim() || process.env.CLAWQL_PROVIDER?.trim().toLowerCase() || undefined;
  return resolveApiBaseUrl(openapi, label);
}

export function resolveApiBaseUrl(openapi: OpenAPIDoc, specLabel?: string): string {
  const selfHosted = resolveBundledSelfHostedBaseUrl(specLabel);
  if (selfHosted) return selfHosted;

  const override = process.env.CLAWQL_API_BASE_URL;
  if (override) return override.replace(/\/$/, "");

  const label = specLabel?.trim().toLowerCase();
  const effective = label || process.env.CLAWQL_PROVIDER?.trim().toLowerCase();
  if (effective && Effect.runSync(isAwsSpecLabelEffect(effective))) {
    return Effect.runSync(resolveAwsApiBaseUrlEffect(openapi));
  }

  const server = openapi.servers?.[0]?.url;
  if (typeof server === "string" && server.length > 0) {
    return server.replace(/\/$/, "");
  }

  throw new Error(
    "OpenAPI spec has no servers[0].url. Set CLAWQL_API_BASE_URL or add servers to your spec."
  );
}

// ─────────────────────────────────────────────
// Flatten the nested resource tree
// ─────────────────────────────────────────────

function flattenOperations(
  resources: Record<string, DiscoveryResource>,
  parentPath: string[]
): Operation[] {
  const ops: Operation[] = [];

  for (const [resourceName, resource] of Object.entries(resources)) {
    const resourcePath = [...parentPath, resourceName];

    if (resource.methods) {
      for (const [, method] of Object.entries(resource.methods)) {
        ops.push(methodToOperation(method, resourceName));
      }
    }

    if (resource.resources) {
      ops.push(...flattenOperations(resource.resources, resourcePath));
    }
  }

  return ops;
}

function methodToOperation(m: DiscoveryMethod, resourceName: string): Operation {
  const params: Record<string, ParameterInfo> = {};
  for (const [name, p] of Object.entries(m.parameters ?? {})) {
    params[name] = {
      type: p.type,
      location: p.location as "path" | "query",
      required: p.required ?? false,
      description: p.description ?? "",
    };
  }

  const path = m.path;
  const flatPath = m.flatPath ?? m.path;
  if (!flatPath || typeof flatPath !== "string") {
    throw new Error(`Discovery method ${m.id} missing path/flatPath`);
  }
  return {
    id: m.id,
    method: m.httpMethod,
    path,
    flatPath,
    description: m.description ?? "",
    resource: resourceName,
    parameters: params,
    scopes: m.scopes ?? [],
    requestBody: m.request?.$ref,
    responseBody: m.response?.$ref,
  };
}

// ─────────────────────────────────────────────
// Discovery → minimal OpenAPI 3.0
// (enough for Omnigraph / GraphQL translation to consume)
// ─────────────────────────────────────────────

export function discoveryToOpenAPI(doc: DiscoveryDoc, operations: Operation[]): OpenAPIDoc {
  const baseUrl = (doc.rootUrl as string).replace(/\/$/, "");
  const paths: Record<string, Record<string, unknown>> = {};
  const oauthScopes: Record<string, string> = {};

  for (const op of operations) {
    for (const scope of op.scopes) {
      oauthScopes[scope] = scope;
    }
    const routeTemplate = op.flatPath ?? op.path;
    const oaPath = "/" + String(routeTemplate).replace(/\{[+]?(\w+)\}/g, "{$1}");

    if (!paths[oaPath]) paths[oaPath] = {};

    const httpVerb = op.method.toLowerCase();
    const parameters = Object.entries(op.parameters)
      .filter(([name, p]) => {
        if (p.location !== "path") return true;
        return oaPath.includes(`{${name}}`);
      })
      .map(([name, p]) => ({
        name,
        in: p.location,
        required: p.required,
        description: p.description,
        schema: { type: p.type },
      }));

    const templateVars = Array.from(oaPath.matchAll(/\{(\w+)\}/g)).map((match) => match[1]);
    for (const name of templateVars) {
      if (!parameters.some((param) => param.name === name)) {
        parameters.push({
          name,
          in: "path",
          required: true,
          description: `Path parameter ${name}`,
          schema: { type: "string" },
        });
      }
    }

    paths[oaPath][httpVerb] = {
      operationId: op.id.replace(/\./g, "_"),
      summary: op.description,
      description: op.description,
      parameters,
      ...(op.requestBody
        ? {
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${op.requestBody}` },
                },
              },
            },
          }
        : {}),
      responses: {
        "200": {
          description: "Success",
          ...(op.responseBody
            ? {
                content: {
                  "application/json": {
                    schema: {
                      $ref: `#/components/schemas/${op.responseBody}`,
                    },
                  },
                },
              }
            : {}),
        },
      },
      security: [{ oauth2: op.scopes }],
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title:
        typeof doc.title === "string" && doc.title.trim().length > 0 ? doc.title : "Google API",
      version:
        typeof doc.version === "string" && doc.version.trim().length > 0 ? doc.version : "v1",
    },
    servers: [{ url: baseUrl }],
    paths,
    components: {
      schemas: sanitizeSchemaNode((doc.schemas as Record<string, unknown>) ?? {}) as Record<
        string,
        unknown
      >,
      securitySchemes: {
        oauth2: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: "https://accounts.google.com/o/oauth2/auth",
              tokenUrl: "https://oauth2.googleapis.com/token",
              scopes: oauthScopes,
            },
          },
        },
      },
    },
  };
}
