/**
 * Dynamic horizontal tier Layer composition for MCP transport and future Operator reconciliation (#255).
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
import { makeOuroborosLayer } from "clawql-ouroboros/plugin";
import { makeSandboxLayer } from "clawql-sandbox/plugin";
import type { Layer } from "effect";

/** Subset of `ClawQLInstance` horizontal tiers mapped to optional tool flags. */
export type ClawQLHorizontalTierSpec = {
  readonly memory?: { readonly enabled?: boolean };
  readonly documents?: {
    readonly enabled?: boolean;
    readonly onyx?: { readonly enabled?: boolean };
    readonly idpPipeline?: { readonly enabled?: boolean };
    readonly idpClassifier?: { readonly enabled?: boolean };
    readonly langextract?: { readonly enabled?: boolean };
  };
  readonly automation?: {
    readonly schedule?: { readonly enabled?: boolean };
    readonly notify?: { readonly enabled?: boolean };
    readonly workflow?: { readonly enabled?: boolean };
    readonly argocd?: { readonly enabled?: boolean };
    readonly hitlLabelStudio?: { readonly enabled?: boolean };
  };
  readonly sandbox?: { readonly enabled?: boolean };
  readonly ouroboros?: {
    readonly enabled?: boolean;
    readonly langfuseEval?: { readonly enabled?: boolean };
  };
};

function tierEnabled(section: { readonly enabled?: boolean } | undefined, fallback: boolean): boolean {
  return section?.enabled ?? fallback;
}

/**
 * Maps a CRD-style horizontal tier spec onto {@link ClawqlOptionalToolFlags}.
 * Unspecified sections inherit from `defaults` (env by default).
 */
export function optionalFlagsFromHorizontalTierSpec(
  spec: ClawQLHorizontalTierSpec,
  defaults: ClawqlOptionalToolFlags = getClawqlOptionalToolFlags()
): ClawqlOptionalToolFlags {
  return {
    ...defaults,
    enableMemory: tierEnabled(spec.memory, defaults.enableMemory),
    enableDocuments: tierEnabled(spec.documents, defaults.enableDocuments),
    enableOnyxKnowledge: tierEnabled(spec.documents?.onyx, defaults.enableOnyxKnowledge),
    enableIdpPipeline: tierEnabled(spec.documents?.idpPipeline, defaults.enableIdpPipeline),
    enableIdpClassifier: tierEnabled(spec.documents?.idpClassifier, defaults.enableIdpClassifier),
    enableLangextract: tierEnabled(spec.documents?.langextract, defaults.enableLangextract),
    enableSchedule: tierEnabled(spec.automation?.schedule, defaults.enableSchedule),
    enableNotify: tierEnabled(spec.automation?.notify, defaults.enableNotify),
    enableWorkflow: tierEnabled(spec.automation?.workflow, defaults.enableWorkflow),
    enableArgoCd: tierEnabled(spec.automation?.argocd, defaults.enableArgoCd),
    enableHitlLabelStudio: tierEnabled(
      spec.automation?.hitlLabelStudio,
      defaults.enableHitlLabelStudio
    ),
    enableSandbox: tierEnabled(spec.sandbox, defaults.enableSandbox),
    enableOuroboros: tierEnabled(spec.ouroboros, defaults.enableOuroboros),
    enableLangfuseEval: tierEnabled(spec.ouroboros?.langfuseEval, defaults.enableLangfuseEval),
  };
}

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
