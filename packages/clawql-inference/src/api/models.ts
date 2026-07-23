import type { Request, Response } from "express";
import { loadModelEscalationConfigAsync } from "../routing/config.js";
import { loadTokenEfficiencyConfig } from "../efficiency/config.js";
import type { ProviderRegistry } from "../providers/types.js";
import { parseModelId } from "../providers/parse-model-id.js";
import {
  findCatalogModel,
  loadInferenceModelCatalog,
  providerCredentialPresent,
} from "../catalog/index.js";
import { toPublicModelId } from "./model-resolve.js";
import { sendOpenAiError } from "./openai-errors.js";

export type OpenAiModelObject = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
};

function parseExtraModels(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CLAWQL_INFERENCE_MODELS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function modelObject(gatewayModelId: string): OpenAiModelObject {
  const { provider, model } = parseModelId(gatewayModelId);
  return {
    id: toPublicModelId(provider, model),
    object: "model",
    created: 1_700_000_000,
    owned_by: provider,
  };
}

export async function collectListedModels(
  registry: ProviderRegistry,
  env: NodeJS.ProcessEnv = process.env
): Promise<OpenAiModelObject[]> {
  const seen = new Set<string>();
  const models: OpenAiModelObject[] = [];

  const add = (gatewayModelId: string) => {
    if (!gatewayModelId.trim() || seen.has(gatewayModelId)) return;
    const { provider } = parseModelId(gatewayModelId);
    if (!registry.has(provider)) return;
    seen.add(gatewayModelId);
    models.push(modelObject(gatewayModelId));
  };

  // 1) Curated BYOK catalog — only surface models whose provider is registered
  //    and credentialed (OpenRouter escape-hatch included when keyed).
  const catalog = await loadInferenceModelCatalog(env);
  const listUncredentialed = env.CLAWQL_INFERENCE_LIST_UNCREDENTIALED === "1";
  for (const entry of catalog.models) {
    if (!registry.has(entry.provider)) continue;
    if (!listUncredentialed && !providerCredentialPresent(entry.provider, env)) continue;
    add(entry.id);
  }

  // 2) Tier map + explicit extras
  const config = await loadModelEscalationConfigAsync(env);
  add(config.tierMap.frugal);
  add(config.tierMap.standard);
  add(config.tierMap.frontier);
  for (const id of parseExtraModels(env)) add(id);

  // 3) Catalog aliases as first-class list entries (when target is credentialed)
  for (const [alias, target] of Object.entries(catalog.aliases)) {
    if (seen.has(alias)) continue;
    const entry = findCatalogModel(target, catalog);
    if (!entry || !registry.has(entry.provider)) continue;
    if (!listUncredentialed && !providerCredentialPresent(entry.provider, env)) continue;
    seen.add(alias);
    models.push({
      id: alias,
      object: "model",
      created: 1_700_000_000,
      owned_by: "clawql",
    });
  }

  const efficiency = loadTokenEfficiencyConfig(env);
  if (efficiency.httpAutoRoute || efficiency.escalation.enabled) {
    for (const id of ["clawql/auto", "clawql/frugal", "clawql/standard", "clawql/frontier"]) {
      if (seen.has(id)) continue;
      seen.add(id);
      models.push({
        id,
        object: "model",
        created: 1_700_000_000,
        owned_by: "clawql",
      });
    }
  }

  if (registry.has("ollama")) {
    try {
      const baseUrl = env.OLLAMA_BASE_URL?.trim().replace(/\/$/, "") || "http://127.0.0.1:11434";
      const res = await fetch(`${baseUrl}/api/tags`);
      if (res.ok) {
        const body = (await res.json()) as { models?: Array<{ name?: string }> };
        for (const tag of body.models ?? []) {
          if (tag.name) add(`ollama/${tag.name}`);
        }
      }
    } catch {
      // Ollama optional — skip live discovery when offline
    }
  }

  return models.sort((a, b) => a.id.localeCompare(b.id));
}

export function createModelsHandlers(registry: ProviderRegistry, env?: NodeJS.ProcessEnv) {
  return {
    list: async (_req: Request, res: Response) => {
      const data = await collectListedModels(registry, env);
      res.json({ object: "list", data });
    },
    get: async (req: Request, res: Response) => {
      const raw = req.params.id;
      const id = (Array.isArray(raw) ? raw[0] : raw)?.trim();
      if (!id) {
        sendOpenAiError(res, 400, "model id is required");
        return;
      }
      const data = await collectListedModels(registry, env);
      const match = data.find((m) => m.id === id);
      if (!match) {
        sendOpenAiError(res, 404, `Model '${id}' not found`, "invalid_request_error");
        return;
      }
      res.json(match);
    },
  };
}
