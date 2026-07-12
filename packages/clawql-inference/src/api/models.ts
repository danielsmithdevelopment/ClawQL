import type { Request, Response } from "express";
import { loadModelEscalationConfigAsync } from "../routing/config.js";
import type { ProviderRegistry } from "../providers/types.js";
import { parseModelId } from "../providers/parse-model-id.js";
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

  const config = await loadModelEscalationConfigAsync(env);
  add(config.tierMap.frugal);
  add(config.tierMap.standard);
  add(config.tierMap.frontier);
  for (const id of parseExtraModels(env)) add(id);

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
