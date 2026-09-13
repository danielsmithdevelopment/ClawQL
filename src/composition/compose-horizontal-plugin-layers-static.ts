/**
 * Static horizontal tier Layer composition (sync imports every package).
 * Used by tests and sync {@link getClawqlApi} bootstrap for backward compatibility.
 */
import {
  basePluginCompositionFlags,
  type ClawqlOptionalToolFlags,
  type ClawQLApiRuntimeError,
  type ClawQLApiRuntimeServices,
} from "clawql-api";
import { makeAutomationLayer } from "clawql-automation/plugin";
import { natsConfiguredForConsumer } from "clawql-automation/nats/env";
import { makeDocumentsLayer } from "clawql-documents/plugin";
import { makeMemoryLayer } from "clawql-memory/plugin";
import { makeOntologyLayer } from "clawql-ontology/plugin";
import { createOuroborosHarnessPlugin, makeHarnessLayer } from "clawql-harness/plugin";
import { makeSandboxLayer } from "clawql-sandbox/plugin";
import { makeDataLayer } from "clawql-data/plugin";
import { makeWebLayer } from "clawql-web/plugin";
import { makeObservabilityLayer } from "clawql-observability/plugin";
import {
  optionalFlagsFromHorizontalTierSpec,
  type ClawQLHorizontalTierSpec,
} from "clawql-operator/spec";
import type { Layer } from "effect";

export type { ClawQLHorizontalTierSpec } from "clawql-operator/spec";
export { optionalFlagsFromHorizontalTierSpec } from "clawql-operator/spec";

export type ComposeHorizontalPluginLayersOptions = {
  /** When true, include NATS workflow worker in AutomationLayer (env-gated by default). */
  readonly includeNatsWorker?: boolean;
};

/**
 * Builds Effect Layers for all enabled horizontal tiers from parsed optional flags.
 */
export function composeHorizontalPluginLayersStatic(
  flags: ClawqlOptionalToolFlags,
  options: ComposeHorizontalPluginLayersOptions = {}
): readonly Layer.Layer<never, ClawQLApiRuntimeError, ClawQLApiRuntimeServices>[] {
  const includeNatsWorker = options.includeNatsWorker ?? natsConfiguredForConsumer();
  const layers: Layer.Layer<never, ClawQLApiRuntimeError, ClawQLApiRuntimeServices>[] = [];
  if (flags.enableMemory) {
    layers.push(makeMemoryLayer());
  }
  if (flags.enableDocuments) {
    layers.push(
      makeDocumentsLayer({
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
    layers.push(
      makeAutomationLayer({
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
    layers.push(makeSandboxLayer());
  }
  if (flags.enableData) {
    layers.push(makeDataLayer());
  }
  if (flags.enableWeb) {
    layers.push(makeWebLayer());
  }
  if (flags.enableObservability) {
    layers.push(makeObservabilityLayer());
  }
  if (flags.enableOntology) {
    layers.push(makeOntologyLayer({ enableWrites: flags.enableOntologyWrites }));
  }
  // Ouroboros is always a clawql-harness plugin (no env / tier enable gate).
  layers.push(
    makeHarnessLayer({
      plugins: [createOuroborosHarnessPlugin({ enableLangfuseEval: flags.enableLangfuseEval })],
    })
  );
  return layers;
}

/** Composes horizontal plugin Layers from a CRD-style tier spec (config — not CLAWQL_ENABLE_*). */
export function composeHorizontalPluginLayersFromTierSpecStatic(
  spec: ClawQLHorizontalTierSpec
): readonly Layer.Layer<never, ClawQLApiRuntimeError, ClawQLApiRuntimeServices>[] {
  const flags = optionalFlagsFromHorizontalTierSpec(spec, basePluginCompositionFlags());
  return composeHorizontalPluginLayersStatic(flags);
}
