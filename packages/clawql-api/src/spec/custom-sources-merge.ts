/**
 * Merge user-added sources from ~/.ClawQL/sources.json into the operation index.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { convertObj } from "swagger2openapi";
import type { LoadedSpec } from "./spec-loader.js";
import { loadOpenAPIFromAbsolutePath } from "./spec-loader.js";
import type { Operation } from "./operation-types.js";
import { loadCliSourceOperations } from "./cli-source-loader.js";
import { loadMcpSourceOperations } from "./mcp-source-loader.js";
import { loadGraphqlNativeOperationsFromConfigs } from "./graphql-native-loader.js";
import { loadGrpcNativeOperationsFromConfigs } from "./grpc-native-loader.js";
import {
  readCustomSourcesFile,
  resolveClawqlHome,
  getCustomSourceCacheDir,
} from "./custom-sources-store.js";
import type { CustomSourceEntry } from "./custom-sources-types.js";
import type { GraphQLSourceConfig } from "./native-protocol-env.js";
import type { GrpcSourceConfig } from "./native-protocol-env.js";

function mergeOps(base: Operation[], extra: Operation[]): Operation[] {
  if (extra.length === 0) return base;
  const seen = new Set(base.map((o) => o.id));
  const merged = [...base];
  for (const op of extra) {
    let id = op.id;
    if (seen.has(id)) {
      id = `${op.specLabel ?? "custom"}::${op.id}`;
      let n = 2;
      while (seen.has(id)) id = `${op.specLabel ?? "custom"}::${op.id}__${n++}`;
    }
    seen.add(id);
    merged.push(id === op.id ? op : { ...op, id });
  }
  return merged;
}

async function loadOpenApiLikeSource(entry: CustomSourceEntry, home: string): Promise<Operation[]> {
  if (!entry.cachePath) {
    console.error(`[spec-loader] Custom source "${entry.id}" missing cachePath`);
    return [];
  }
  const abs = resolve(home, entry.cachePath);
  try {
    const loaded = await loadOpenAPIFromAbsolutePath(abs);
    return loaded.operations.map((op) => ({
      ...op,
      specLabel: entry.id,
      id: `${entry.id}::${op.id}`,
    }));
  } catch (e: unknown) {
    console.error(
      `[spec-loader] Custom source "${entry.id}" load failed:`,
      e instanceof Error ? e.message : e
    );
    return [];
  }
}

function toGraphqlConfig(entry: CustomSourceEntry, home: string): GraphQLSourceConfig | null {
  const endpoint = entry.graphqlEndpoint?.trim();
  if (!endpoint) return null;
  const cacheAbs = entry.cachePath ? resolve(home, entry.cachePath) : undefined;
  const isIntrospection = entry.cachePath?.includes("introspection");
  return {
    name: entry.id,
    endpoint,
    ...(cacheAbs
      ? isIntrospection
        ? { introspectionPath: cacheAbs }
        : { schemaPath: cacheAbs }
      : {}),
  };
}

function toGrpcConfig(entry: CustomSourceEntry, home: string): GrpcSourceConfig | null {
  const endpoint = entry.grpcEndpoint?.trim();
  const protoPath = entry.protoPath?.trim();
  if (!endpoint || !protoPath) return null;
  return {
    name: entry.id,
    endpoint,
    protoPath: resolve(home, protoPath),
    insecure: entry.grpcInsecure === true,
  };
}

export async function mergeCustomSourceOperations(loaded: LoadedSpec): Promise<LoadedSpec> {
  const home = resolveClawqlHome();
  const file = await readCustomSourcesFile(home);
  if (file.sources.length === 0) return loaded;

  let operations = loaded.operations;
  const openapis = loaded.openapis ? [...loaded.openapis] : loaded.openapi ? [loaded.openapi] : [];

  const openapiLike = file.sources.filter((s) => s.kind === "openapi" || s.kind === "discovery");
  for (const entry of openapiLike) {
    const ops = await loadOpenApiLikeSource(entry, home);
    operations = mergeOps(operations, ops);
    if (ops.length > 0 && entry.cachePath) {
      try {
        const built = await loadOpenAPIFromAbsolutePath(resolve(home, entry.cachePath));
        openapis.push(built.openapi);
      } catch {
        /* skip */
      }
    }
  }

  const gqlConfigs = file.sources
    .filter((s) => s.kind === "graphql")
    .map((e) => toGraphqlConfig(e, home))
    .filter((c): c is GraphQLSourceConfig => c !== null);
  if (gqlConfigs.length) {
    const gqlOps = await loadGraphqlNativeOperationsFromConfigs(gqlConfigs);
    operations = mergeOps(operations, gqlOps);
  }

  const grpcConfigs = file.sources
    .filter((s) => s.kind === "grpc")
    .map((e) => toGrpcConfig(e, home))
    .filter((c): c is GrpcSourceConfig => c !== null);
  if (grpcConfigs.length) {
    const grpcOps = await loadGrpcNativeOperationsFromConfigs(grpcConfigs);
    operations = mergeOps(operations, grpcOps);
  }

  const mcpOps = await loadMcpSourceOperations(file.sources);
  operations = mergeOps(operations, mcpOps);

  const cliOps = await loadCliSourceOperations(file.sources);
  operations = mergeOps(operations, cliOps);

  const added = operations.length - loaded.operations.length;
  if (added > 0) {
    console.error(`[spec-loader] Merged ${added} custom source operation(s) from sources.json`);
  }

  return {
    ...loaded,
    operations,
    ...(openapis.length > 1 ? { openapis, multi: true } : {}),
  };
}

/**
 * Persist fetched spec body for openapi/discovery/graphql/grpc URL sources.
 */
export async function cacheCustomSourceBody(
  entry: CustomSourceEntry,
  bodyText: string,
  home = resolveClawqlHome()
): Promise<CustomSourceEntry> {
  const dir = getCustomSourceCacheDir(entry.id, home);
  let filename = "spec.json";
  if (entry.kind === "graphql" && bodyText.includes("type ")) filename = "schema.graphql";
  else if (entry.kind === "graphql") filename = "introspection.json";
  else if (entry.kind === "grpc") filename = "service.proto";
  else if (entry.kind === "openapi" && bodyText.trim().startsWith("openapi:"))
    filename = "openapi.yaml";
  else if (entry.kind === "openapi") filename = "openapi.json";

  const abs = join(dir, filename);
  let toWrite = bodyText;
  if (entry.kind === "openapi" && bodyText.includes('"swagger": "2.0"')) {
    const { openapi } = await convertObj(JSON.parse(bodyText) as object, {
      patch: true,
      warnOnly: true,
    });
    toWrite = JSON.stringify(openapi, null, 2);
    filename = "openapi.json";
  }

  await writeFile(join(dir, filename), toWrite, "utf8");
  const cachePath = `sources/${entry.id}/${filename}`;
  return { ...entry, cachePath };
}
