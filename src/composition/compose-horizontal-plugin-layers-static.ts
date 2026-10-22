/**
 * Sync horizontal tier Layer composition for {@link getClawqlApi}.
 *
 * Every optional package is loaded via `createRequire` only when its flag is on —
 * same pattern as DuckDB (`clawql-data`). Static `import` of those packages would
 * map Kubernetes clients, Stripe, embedding stacks, etc. into every slim listen
 * (equal-arm / board), even when the tier is disabled.
 */
import { createRequire } from "node:module";
import {
  basePluginCompositionFlags,
  type ClawqlOptionalToolFlags,
  type ClawQLApiRuntimeError,
  type ClawQLApiRuntimeServices,
} from "clawql-api";
import {
  optionalFlagsFromHorizontalTierSpec,
  type ClawQLHorizontalTierSpec,
} from "clawql-operator/spec";
import type { Layer } from "effect";

export type { ClawQLHorizontalTierSpec } from "clawql-operator/spec";
export { optionalFlagsFromHorizontalTierSpec } from "clawql-operator/spec";

const requireFromHere = createRequire(import.meta.url);

export type ComposeHorizontalPluginLayersOptions = {
  /** When true, include NATS workflow worker in AutomationLayer (env-gated by default). */
  readonly includeNatsWorker?: boolean;
};

/** Env-only NATS consumer probe — avoid loading clawql-automation just to check. */
function natsConsumerWantedFromEnv(): boolean {
  const truthy = (v: string | undefined): boolean => {
    const t = v?.trim().toLowerCase();
    return t === "1" || t === "true" || t === "yes";
  };
  if (!process.env.CLAWQL_NATS_URL?.trim()) return false;
  if (!truthy(process.env.CLAWQL_NATS_JETSTREAM) || !truthy(process.env.CLAWQL_NATS_ENABLE_CONSUMER)) {
    return false;
  }
  return (
    truthy(process.env.CLAWQL_NATS_CONSUMER_RESUME_WORKFLOW) ||
    truthy(process.env.CLAWQL_NATS_CONSUMER_IDP_PIPELINE) ||
    truthy(process.env.CLAWQL_NATS_CONSUMER_CONESHARE_FOLLOWUP)
  );
}

/**
 * Builds Effect Layers for all enabled horizontal tiers from parsed optional flags.
 */
export function composeHorizontalPluginLayersStatic(
  flags: ClawqlOptionalToolFlags,
  options: ComposeHorizontalPluginLayersOptions = {}
): readonly Layer.Layer<never, ClawQLApiRuntimeError, ClawQLApiRuntimeServices>[] {
  const includeNatsWorker = options.includeNatsWorker ?? natsConsumerWantedFromEnv();
  const layers: Layer.Layer<never, ClawQLApiRuntimeError, ClawQLApiRuntimeServices>[] = [];

  if (flags.enableMemory) {
    const { makeMemoryLayer } = requireFromHere(
      "clawql-memory/plugin"
    ) as typeof import("clawql-memory/plugin");
    layers.push(makeMemoryLayer());
  }
  if (flags.enableDocuments) {
    const { makeDocumentsLayer } = requireFromHere(
      "clawql-documents/plugin"
    ) as typeof import("clawql-documents/plugin");
    layers.push(
      makeDocumentsLayer({
        enableExternalIngest: flags.externalIngestPreview,
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
    const { makeAutomationLayer } = requireFromHere(
      "clawql-automation/plugin"
    ) as typeof import("clawql-automation/plugin");
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
    const { makeSandboxLayer } = requireFromHere(
      "clawql-sandbox/plugin"
    ) as typeof import("clawql-sandbox/plugin");
    layers.push(makeSandboxLayer());
  }
  if (flags.enableData) {
    // Lazy: @duckdb native bindings are tens of MB mapped even when unused.
    const { makeDataLayer } = requireFromHere(
      "clawql-data/plugin"
    ) as typeof import("clawql-data/plugin");
    layers.push(makeDataLayer({ enableClawqlSqlAlias: flags.enableClawqlSqlAlias }));
  }
  if (flags.enableWeb) {
    const { makeWebLayer } = requireFromHere(
      "clawql-web/plugin"
    ) as typeof import("clawql-web/plugin");
    layers.push(makeWebLayer());
  }
  if (flags.enableObservability) {
    const { makeObservabilityLayer } = requireFromHere(
      "clawql-observability/plugin"
    ) as typeof import("clawql-observability/plugin");
    layers.push(makeObservabilityLayer());
  }
  if (flags.enableChatgptExtensions) {
    const { makeChatgptExtensionsLayer } = requireFromHere(
      "clawql-chatgpt-extensions/plugin"
    ) as typeof import("clawql-chatgpt-extensions/plugin");
    layers.push(makeChatgptExtensionsLayer());
  }
  if (flags.enableOntology) {
    const { makeOntologyLayer } = requireFromHere(
      "clawql-ontology/plugin"
    ) as typeof import("clawql-ontology/plugin");
    layers.push(makeOntologyLayer({ enableWrites: flags.enableOntologyWrites }));
  }
  if (flags.enableSupabase) {
    const { makeSupabaseLayer } = requireFromHere(
      "clawql-supabase/plugin"
    ) as typeof import("clawql-supabase/plugin");
    layers.push(makeSupabaseLayer());
  }
  // Ouroboros / clawql_think (8.0 demotion): opt-in via enableOuroborosTools.
  if (flags.enableOuroborosTools) {
    const { createOuroborosHarnessPlugin, makeHarnessLayer } = requireFromHere(
      "clawql-harness/plugin"
    ) as typeof import("clawql-harness/plugin");
    layers.push(
      makeHarnessLayer({
        plugins: [createOuroborosHarnessPlugin({ enableLangfuseEval: flags.enableLangfuseEval })],
      })
    );
  }
  return layers;
}

/** Composes horizontal plugin Layers from a CRD-style tier spec (config — not CLAWQL_ENABLE_*). */
export function composeHorizontalPluginLayersFromTierSpecStatic(
  spec: ClawQLHorizontalTierSpec
): readonly Layer.Layer<never, ClawQLApiRuntimeError, ClawQLApiRuntimeServices>[] {
  const flags = optionalFlagsFromHorizontalTierSpec(spec, basePluginCompositionFlags());
  return composeHorizontalPluginLayersStatic(flags);
}
