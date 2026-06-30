import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { McpToolRegistry } from "clawql-api";
import { configureDocumentsPluginDeps } from "./deps.js";
import { createDocumentsPlugin, DOCUMENTS_PLUGIN_ID } from "./documents-plugin.js";

describe("createDocumentsPlugin", () => {
  it("registers ingest_external_knowledge on onRegister", () => {
    configureDocumentsPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createDocumentsPlugin();
    expect(plugin.id).toBe(DOCUMENTS_PLUGIN_ID);
    Effect.runSync(plugin.onRegister!(api));
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["ingest_external_knowledge"]);
  });

  it("registers knowledge_search_onyx when enableOnyx is true", () => {
    configureDocumentsPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    Effect.runSync(createDocumentsPlugin({ enableOnyx: true }).onRegister!(api));
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["ingest_external_knowledge", "knowledge_search_onyx"]);
  });
});
