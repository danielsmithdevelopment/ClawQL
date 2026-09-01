/**
 * Dynamic horizontal plugin Layer composition (8.0).
 * Uses dynamic `import()` so only enabled packages are loaded — pairs with
 * optionalDependencies. The static `compose-horizontal-plugin-layers.ts` still
 * static-imports every package (Layer include ≠ zero-import).
 *
 * @see docs/design/clawql-core-plugin-architecture.md §10
 */

import {
  basePluginCompositionFlags,
  type ClawqlOptionalToolFlags,
  type ClawQLApiRuntimeError,
  type ClawQLApiRuntimeServices,
} from "clawql-api";
import { natsConfiguredForConsumer } from "clawql-automation/nats/env";
import {
  optionalFlagsFromHorizontalTierSpec,
  type ClawQLHorizontalTierSpec,
} from "clawql-operator/spec";
import { ClawQLError } from "clawql-core";
import { Effect, type Layer } from "effect";

export type { ClawQLHorizontalTierSpec } from "clawql-operator/spec";
export { optionalFlagsFromHorizontalTierSpec } from "clawql-operator/spec";

export type ComposeHorizontalPluginLayersOptions = {
  readonly includeNatsWorker?: boolean;
};

type HorizLayer = Layer.Layer<never, ClawQLApiRuntimeError, ClawQLApiRuntimeServices>;

function loadPlugin<T>(specifier: string): Effect.Effect<T, ClawQLError> {
  return Effect.tryPromise({
    try: () => import(specifier) as Promise<T>,
    catch: (cause) => new ClawQLError({ reason: `Failed to load ${specifier}`, cause }),
  });
}

/**
 * Effect that builds horizontal Layers via dynamic import of only enabled packages.
 */
export function composeHorizontalPluginLayersDynamicEffect(
  flags: ClawqlOptionalToolFlags,
  options: ComposeHorizontalPluginLayersOptions = {}
): Effect.Effect<readonly HorizLayer[], ClawQLError> {
  return Effect.gen(function* () {
    const includeNatsWorker = options.includeNatsWorker ?? natsConfiguredForConsumer();
    const layers: HorizLayer[] = [];

    if (flags.enableMemory) {
      const mod = yield* loadPlugin<{ makeMemoryLayer: () => HorizLayer }>("clawql-memory/plugin");
      layers.push(mod.makeMemoryLayer());
    }

    if (flags.enableDocuments) {
      const mod = yield* loadPlugin<{
        makeDocumentsLayer: (opts: Record<string, unknown>) => HorizLayer;
      }>("clawql-documents/plugin");
      layers.push(
        mod.makeDocumentsLayer({
          enableOnyx: flags.enableOnyxKnowledge,
          enableIdpPipeline: flags.enableIdpPipeline,
          enableIdpClassifier: flags.enableIdpClassifier,
          enableLangextract: flags.enableLangextract,
          enablePdfInspector: flags.enablePdfInspector,
          enableAnydoc: flags.enableAnydoc,
        })
      );
    }

    if (
      flags.enableSchedule ||
      flags.enableNotify ||
      flags.enableWorkflow ||
      flags.enableArgoCd ||
      flags.enableHitlLabelStudio ||
      includeNatsWorker
    ) {
      const mod = yield* loadPlugin<{
        makeAutomationLayer: (opts: Record<string, unknown>) => HorizLayer;
      }>("clawql-automation/plugin");
      layers.push(
        mod.makeAutomationLayer({
          enableSchedule: flags.enableSchedule,
          enableNotify: flags.enableNotify,
          enableWorkflow: flags.enableWorkflow,
          enableArgoCd: flags.enableArgoCd,
          enableHitlLabelStudio: flags.enableHitlLabelStudio,
          enableNatsWorker: includeNatsWorker,
        })
      );
    }

    if (flags.enableSandbox) {
      const mod = yield* loadPlugin<{ makeSandboxLayer: () => HorizLayer }>(
        "clawql-sandbox/plugin"
      );
      layers.push(mod.makeSandboxLayer());
    }

    if (flags.enableData) {
      const mod = yield* loadPlugin<{ makeDataLayer: () => HorizLayer }>("clawql-data/plugin");
      layers.push(mod.makeDataLayer());
    }

    if (flags.enableWeb) {
      const mod = yield* loadPlugin<{ makeWebLayer: () => HorizLayer }>("clawql-web/plugin");
      layers.push(mod.makeWebLayer());
    }

    if (flags.enableObservability) {
      const mod = yield* loadPlugin<{ makeObservabilityLayer: () => HorizLayer }>(
        "clawql-observability/plugin"
      );
      layers.push(mod.makeObservabilityLayer());
    }

    if (flags.enableOntology) {
      const mod = yield* loadPlugin<{
        makeOntologyLayer: (opts: { enableWrites: boolean }) => HorizLayer;
      }>("clawql-ontology/plugin");
      layers.push(mod.makeOntologyLayer({ enableWrites: flags.enableOntologyWrites }));
    }

    // Ouroboros always via clawql-harness (same as static compose).
    const harness = yield* loadPlugin<{
      makeHarnessLayer: (opts: { plugins: unknown[] }) => HorizLayer;
      createOuroborosHarnessPlugin: (opts: { enableLangfuseEval: boolean }) => unknown;
    }>("clawql-harness/plugin");
    layers.push(
      harness.makeHarnessLayer({
        plugins: [
          harness.createOuroborosHarnessPlugin({ enableLangfuseEval: flags.enableLangfuseEval }),
        ],
      })
    );

    return layers;
  });
}

/** Promise façade for transport hosts that cannot yield* Effects. */
export async function composeHorizontalPluginLayersDynamic(
  flags: ClawqlOptionalToolFlags,
  options: ComposeHorizontalPluginLayersOptions = {}
): Promise<readonly HorizLayer[]> {
  return Effect.runPromise(composeHorizontalPluginLayersDynamicEffect(flags, options));
}

export function composeHorizontalPluginLayersDynamicFromTierSpec(
  spec: ClawQLHorizontalTierSpec
): Effect.Effect<readonly HorizLayer[], ClawQLError> {
  const flags = optionalFlagsFromHorizontalTierSpec(spec, basePluginCompositionFlags());
  return composeHorizontalPluginLayersDynamicEffect(flags);
}
