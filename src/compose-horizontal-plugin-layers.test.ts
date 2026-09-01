import { describe, expect, it } from "vitest";
import { MEMORY_PLUGIN_ID } from "clawql-memory/plugin";
import { SANDBOX_PLUGIN_ID } from "clawql-sandbox/plugin";
import { DATA_PLUGIN_ID } from "clawql-data/plugin";
import { OBSERVABILITY_PLUGIN_ID } from "clawql-observability/plugin";
import { createClawQLApi } from "clawql-api";
import {
  composeHorizontalPluginLayers,
  composeHorizontalPluginLayersFromTierSpec,
  optionalFlagsFromHorizontalTierSpec,
} from "./compose-horizontal-plugin-layers.js";

const baseFlags = {
  enableMemory: false,
  enableDocuments: false,
  enableSandbox: false,
  enableData: false,
  enableWeb: false,
  enableSchedule: false,
  enableNotify: false,
  enableWorkflow: false,
  enableArgoCd: false,
  enableHitlLabelStudio: false,
  enableOnyxKnowledge: false,
  enableIdpPipeline: false,
  enableIdpClassifier: false,
  enableLangextract: false,
  enablePdfInspector: false,
  enableAnydoc: false,
  enableLangfuseEval: false,
  enableObservability: false,
  enableGrpc: false,
  enableGrpcReflection: false,
  externalIngestPreview: false,
  enableVision: false,
  enableConeshare: false,
  enableCodeGraph: false,
  enableOntology: false,
  enableOntologyWrites: false,
  enableGoogle: false,
  enableCloudflare: true,
  enableAws: false,
} as const;

describe("composeHorizontalPluginLayers", () => {
  it("includes memory and sandbox layers from flags", () => {
    const layers = composeHorizontalPluginLayers({
      ...baseFlags,
      enableMemory: true,
      enableSandbox: true,
      enableData: true,
    });
    const api = createClawQLApi({ plugins: [], pluginLayers: [...layers] });
    const ids = api.registry.list().map((p) => p.id);
    expect(ids).toContain(MEMORY_PLUGIN_ID);
    expect(ids).toContain(SANDBOX_PLUGIN_ID);
    expect(ids).toContain(DATA_PLUGIN_ID);
  });

  it("maps tier spec to flags and composes layers", () => {
    const flags = optionalFlagsFromHorizontalTierSpec({
      memory: { enabled: true },
      documents: { enabled: false },
      sandbox: { enabled: false },
      ouroboros: { enabled: false, langfuseEval: { enabled: true } },
    });
    expect(flags.enableMemory).toBe(true);
    expect(flags.enableDocuments).toBe(false);
    expect(flags.enableLangfuseEval).toBe(true);

    const layers = composeHorizontalPluginLayersFromTierSpec({
      memory: { enabled: true },
      documents: { enabled: false },
    });
    const api = createClawQLApi({ plugins: [], pluginLayers: [...layers] });
    expect(api.registry.list().some((p) => p.id === MEMORY_PLUGIN_ID)).toBe(true);
    expect(api.registry.list().some((p) => p.id === "clawql-harness")).toBe(true);
  });

  it("registers observability plugin when enabled", () => {
    const layers = composeHorizontalPluginLayers({
      ...baseFlags,
      enableObservability: true,
    });
    const api = createClawQLApi({ plugins: [], pluginLayers: [...layers] });
    expect(api.registry.list().some((p) => p.id === OBSERVABILITY_PLUGIN_ID)).toBe(true);
    expect(api.listMcpTools().some((t) => t.name === "observability_health")).toBe(true);
    expect(api.listMcpTools().some((t) => t.name === "observability_alerts")).toBe(true);
  });
});
