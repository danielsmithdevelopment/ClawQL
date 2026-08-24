import { join } from "node:path";
import { InMemoryInferenceStore } from "./in-memory.js";
import { JsonlInferenceStore } from "./jsonl.js";
import { PostgresInferenceStore } from "./postgres.js";
import { getInferencePgPool, registerInferencePoolShutdownHooks } from "./postgres-pool.js";
import type { InferenceStore, InferenceStoreBackend } from "./types.js";
import { withInferenceLokiPush } from "../observability/loki-store.js";

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
  if (raw === "postgres" || raw === "pg") return "postgres";
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

  let inner: InferenceStore;
  if (backend === "memory") {
    inner = new InMemoryInferenceStore();
  } else if (backend === "postgres") {
    const pool = getInferencePgPool(env);
    if (!pool) {
      throw new Error(
        "CLAWQL_INFERENCE_STORE=postgres requires CLAWQL_INFERENCE_DATABASE_URL or CLAWQL_INFERENCE_DB_* settings"
      );
    }
    registerInferencePoolShutdownHooks();
    inner = new PostgresInferenceStore(pool, env);
  } else {
    inner = new JsonlInferenceStore(options.jsonlPath ?? resolveInferenceStorePath(env));
  }
  return withInferenceLokiPush(inner, env);
}
