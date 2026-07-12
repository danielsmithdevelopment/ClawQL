import { join } from "node:path";
import { InMemoryInferenceStore } from "./in-memory.js";
import { JsonlInferenceStore } from "./jsonl.js";
import type { InferenceStore, InferenceStoreBackend } from "./types.js";

export type CreateInferenceStoreOptions = {
  env?: NodeJS.ProcessEnv;
  backend?: InferenceStoreBackend;
  jsonlPath?: string;
};

export function resolveInferenceStoreBackend(
  env: NodeJS.ProcessEnv = process.env
): InferenceStoreBackend {
  const raw = env.CLAWQL_INFERENCE_STORE?.trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "memory") return "memory";
  if (raw === "jsonl" || raw === "file") return "jsonl";
  if (env.CLAWQL_HOME?.trim() || env.CLAWQL_INFERENCE_STORE_PATH?.trim()) return "jsonl";
  return "memory";
}

export function resolveInferenceStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAWQL_INFERENCE_STORE_PATH?.trim();
  if (explicit) return explicit;
  const home = env.CLAWQL_HOME?.trim() || join(process.env.HOME ?? "", ".ClawQL");
  return join(home, "Inference", "calls.jsonl");
}

export function createInferenceStore(
  options: CreateInferenceStoreOptions = {}
): InferenceStore | null {
  const env = options.env ?? process.env;
  const backend = options.backend ?? resolveInferenceStoreBackend(env);
  if (backend === "off") return null;
  if (backend === "memory") return new InMemoryInferenceStore();
  return new JsonlInferenceStore(options.jsonlPath ?? resolveInferenceStorePath(env));
}
