import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { McpToolRegistry } from "clawql-api";
import {
  createInMemoryPluginHostServices,
  type ClawQLPluginRegistrationApi,
  type ProviderPlugin,
} from "clawql-core";
import { configureDocumentsPluginDeps } from "./deps.js";
import { createDocumentsPlugin, DOCUMENTS_PLUGIN_ID } from "./documents-plugin.js";

function installPluginMcpTools(plugin: ProviderPlugin, api: ClawQLPluginRegistrationApi) {
  const host = createInMemoryPluginHostServices();
  Effect.runSync(
    plugin.install({ registrationApi: api, pluginId: plugin.id }).pipe(Effect.provide(host.layer))
  );
}

describe("createDocumentsPlugin", () => {
  it("registers ingest_external_knowledge on install", () => {
    configureDocumentsPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createDocumentsPlugin();
    expect(plugin.id).toBe(DOCUMENTS_PLUGIN_ID);
    installPluginMcpTools(plugin, api);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["ingest_external_knowledge"]);
  });

  it("registers knowledge_search_onyx when enableOnyx is true", () => {
    configureDocumentsPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createDocumentsPlugin({ enableOnyx: true }), api);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["ingest_external_knowledge", "knowledge_search_onyx"]);
  });

  it("registers run_idp_pipeline when enableIdpPipeline is true", () => {
    configureDocumentsPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createDocumentsPlugin({ enableIdpPipeline: true }), api);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["ingest_external_knowledge", "run_idp_pipeline"]);
  });

  it("registers classify_document when enableIdpClassifier is true", () => {
    configureDocumentsPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createDocumentsPlugin({ enableIdpClassifier: true }), api);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["ingest_external_knowledge", "classify_document"]);
  });

  it("registers extract_document when enableLangextract is true", () => {
    configureDocumentsPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createDocumentsPlugin({ enableLangextract: true }), api);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["ingest_external_knowledge", "extract_document"]);
  });

  it("registers inspect_pdf when enablePdfInspector is true", () => {
    configureDocumentsPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createDocumentsPlugin({ enablePdfInspector: true }), api);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["ingest_external_knowledge", "inspect_pdf"]);
  });

  it("registers convert_document when enableAnydoc is true", () => {
    configureDocumentsPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createDocumentsPlugin({ enableAnydoc: true }), api);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["ingest_external_knowledge", "convert_document"]);
  });
});
