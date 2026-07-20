/**
 * Dynamic horizontal tier Layer composition for MCP transport and Operator reconciliation (#255).
 */
import {
  getClawqlOptionalToolFlags,
  type ClawqlOptionalToolFlags,
  type ClawQLApiRuntimeError,
  type ClawQLApiRuntimeServices,
} from "clawql-api";
import { makeAutomationLayer } from "clawql-automation/plugin";
import { natsConfiguredForConsumer } from "clawql-automation/nats/env";
import { makeDocumentsLayer } from "clawql-documents/plugin";
import { makeMemoryLayer } from "clawql-memory/plugin";
import { makeOntologyLayer } from "clawql-ontology/plugin";
import { makeOuroborosLayer } from "clawql-ouroboros/plugin";
import { makeSandboxLayer } from "clawql-sandbox/plugin";
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
export function composeHorizontalPluginLayers(
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
  if (flags.enableOntology) {
    layers.push(makeOntologyLayer({ enableWrites: flags.enableOntologyWrites }));
  }
  if (flags.enableOuroboros) {
    layers.push(makeOuroborosLayer({ enableLangfuseEval: flags.enableLangfuseEval }));
  }
  return layers;
}

/** Composes horizontal plugin Layers from a CRD-style tier spec plus optional env defaults. */
export function composeHorizontalPluginLayersFromTierSpec(
  spec: ClawQLHorizontalTierSpec,
  env: NodeJS.ProcessEnv = process.env
): readonly Layer.Layer<never, ClawQLApiRuntimeError, ClawQLApiRuntimeServices>[] {
  const flags = optionalFlagsFromHorizontalTierSpec(spec, getClawqlOptionalToolFlags(env));
  return composeHorizontalPluginLayers(flags);
}
