import {
  createClawQLApi,
  composeDefaultPlugins,
  loadSpec,
  makeExecuteLive,
  McpProxyPipeline,
  type ClawQLApiHandle,
  type CreateClawQLApiOptions,
  type ExecuteClawqlOperationParams,
  type LoadedSpec,
  type LoadSpecFn,
} from "clawql-api";
import { defaultPaymentsProxyPlugins } from "clawql-payments/plugin";
import { closeOuroborosPgPool } from "clawql-ouroboros/plugin";
import { closePostgresVectorPool } from "clawql-memory/vector/pgvector";
import { createRequire } from "node:module";
import { Effect } from "effect";
import { composeHorizontalPluginLayersDynamic } from "./compose-horizontal-plugin-layers-dynamic.js";
import { composeHorizontalPluginLayersStatic } from "./compose-horizontal-plugin-layers-static.js";
import { attachActiveOtelParent, makeEffectOtelTracerLayer } from "./effect-otel-bridge.js";
import { disposeProcessWormHost, ensureProcessWormHostBooted } from "./process-worm-host.js";
import { resolvePluginCompositionFlags } from "./resolve-plugin-flags.js";

const requireFromHere = createRequire(import.meta.url);

let loadSpecOverride: LoadSpecFn | undefined;
let shutdownHooksRegistered = false;

/** Test hook — inject mock loadSpec for search/execute handlers. */
export function setLoadSpecForTests(fn: LoadSpecFn | undefined): void {
  loadSpecOverride = fn;
  resetClawqlApiForTests();
}

function resolveLoadSpec(): LoadSpecFn {
  return loadSpecOverride ?? loadSpec;
}

function buildExecuteLive() {
  return makeExecuteLive(resolveLoadSpec());
}

let apiHandle: ClawQLApiHandle | undefined;
let ensureApiPromise: Promise<ClawQLApiHandle> | undefined;

function buildClawqlApi(
  pluginLayers: CreateClawQLApiOptions["pluginLayers"],
  vaultSeedLayer?: CreateClawQLApiOptions["vaultSeedLayer"]
): ClawQLApiHandle {
  // Omit searchLayer — createClawQLApi wires host.skillRegistry into unified search.
  return createClawQLApi({
    executeLayer: buildExecuteLive(),
    plugins: [...composeDefaultPlugins(), ...defaultPaymentsProxyPlugins()],
    pluginLayers,
    vaultSeedLayer,
    runtimeLayers: [makeEffectOtelTracerLayer()],
    prepareEffect: attachActiveOtelParent,
  });
}

async function resolveVaultSeedLayer(): Promise<
  CreateClawQLApiOptions["vaultSeedLayer"] | undefined
> {
  try {
    const mem = await import("clawql-memory/plugin");
    if (typeof mem.MemoryVaultSeedLive !== "undefined") {
      return mem.MemoryVaultSeedLive;
    }
  } catch {
    /* memory package optional at edge */
  }
  return undefined;
}

/** Sync vault-seed for {@link getClawqlApi} — same Layer as async when memory is installed. */
function resolveVaultSeedLayerSync(): CreateClawQLApiOptions["vaultSeedLayer"] | undefined {
  try {
    const mem = requireFromHere("clawql-memory/plugin") as typeof import("clawql-memory/plugin");
    if (typeof mem.MemoryVaultSeedLive !== "undefined") {
      return mem.MemoryVaultSeedLive;
    }
  } catch {
    /* optional */
  }
  return undefined;
}

/**
 * Async production bootstrap — composes horizontal tiers via dynamic import so disabled
 * packages are not statically loaded. Safe to call multiple times; returns existing handle.
 */
export async function ensureClawqlApi(): Promise<ClawQLApiHandle> {
  if (apiHandle) return apiHandle;
  if (ensureApiPromise) return ensureApiPromise;
  ensureApiPromise = (async () => {
    void ensureProcessWormHostBooted().catch(() => undefined);
    const pluginLayers = await composeHorizontalPluginLayersDynamic(
      resolvePluginCompositionFlags()
    );
    const vaultSeedLayer = await resolveVaultSeedLayer();
    apiHandle = buildClawqlApi(pluginLayers, vaultSeedLayer);
    return apiHandle;
  })();
  try {
    return await ensureApiPromise;
  } finally {
    ensureApiPromise = undefined;
  }
}

/** Process-wide ClawQL API runtime (search/execute + plugin registry). */
export function getClawqlApi(): ClawQLApiHandle {
  if (!apiHandle) {
    // Fire-and-forget: durable WORM when CLAWQL_WORM_ENABLED=1 (does not block API build).
    void ensureProcessWormHostBooted().catch(() => undefined);
    apiHandle = buildClawqlApi(
      composeHorizontalPluginLayersStatic(resolvePluginCompositionFlags()),
      resolveVaultSeedLayerSync()
    );
  }
  return apiHandle;
}

/**
 * Dispose plugins, ManagedRuntime, and shared IO pools.
 * Safe to call multiple times; next {@link getClawqlApi} rebuilds a fresh runtime.
 */
export async function disposeClawqlApi(): Promise<void> {
  const handle = apiHandle;
  apiHandle = undefined;
  ensureApiPromise = undefined;
  if (handle) {
    await handle.dispose().catch(() => undefined);
  }
  await Promise.all([
    closePostgresVectorPool().catch(() => undefined),
    closeOuroborosPgPool().catch(() => undefined),
    disposeProcessWormHost().catch(() => undefined),
  ]);
}

/** Test helper — next getClawqlApi() builds a fresh runtime. */
export function resetClawqlApiForTests(): void {
  if (!apiHandle) return;
  Effect.runSync(apiHandle.registry.teardownAll());
  apiHandle = undefined;
  ensureApiPromise = undefined;
}

/** Register SIGINT/SIGTERM → {@link disposeClawqlApi} once per process. */
export function registerClawqlApiShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const once = (): void => {
    void disposeClawqlApi().catch(() => undefined);
  };
  process.once("SIGINT", once);
  process.once("SIGTERM", once);
}

/** Run HookRegistry pre-execute hooks (Panguard policy, x402 payment gates, …). */
export async function runMcpProxyBeforeCallTool(toolName: string, args: unknown): Promise<void> {
  await getClawqlApi().run(
    Effect.gen(function* () {
      const pipeline = yield* McpProxyPipeline;
      yield* pipeline.runBeforeCallTool({ toolName, args });
    })
  );
}

export type { ExecuteClawqlOperationParams, LoadedSpec, LoadSpecFn };
