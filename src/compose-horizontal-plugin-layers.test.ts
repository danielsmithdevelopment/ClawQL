import { describe, expect, it } from "vitest";
import { MEMORY_PLUGIN_ID } from "clawql-memory/plugin";
import { SANDBOX_PLUGIN_ID } from "clawql-sandbox/plugin";
import { DATA_PLUGIN_ID } from "clawql-data/plugin";
import { createClawQLApi } from "clawql-api";
import {
  composeHorizontalPluginLayers,
  composeHorizontalPluginLayersFromTierSpec,
  optionalFlagsFromHorizontalTierSpec,
} from "./compose-horizontal-plugin-layers.js";

describe("composeHorizontalPluginLayers", () => {
  it("includes memory and sandbox layers from flags", () => {
    const layers = composeHorizontalPluginLayers({
      enableMemory: true,
      enableDocuments: false,
      enableSandbox: true,
      enableData: true,
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
    });
    const api = createClawQLApi({ plugins: [], pluginLayers: layers });
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
    const api = createClawQLApi({ plugins: [], pluginLayers: layers });
    expect(api.registry.list().some((p) => p.id === MEMORY_PLUGIN_ID)).toBe(true);
    expect(api.registry.list().some((p) => p.id === "clawql-harness")).toBe(true);
  });
});
