import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { DEFAULT_PIPELINE_CONFIG, type InferencePipelineConfig } from "./types.js";

const FILE_NAME = "pipeline.json";

export function resolvePipelineConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Inference", FILE_NAME);
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export function loadPipelineConfigEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<InferencePipelineConfig | null> {
  return Effect.tryPromise({
    try: async () => {
      const raw = await readFile(resolvePipelineConfigPath(env), "utf8");
      return JSON.parse(raw) as InferencePipelineConfig;
    },
    catch: asError,
  }).pipe(Effect.orElseSucceed(() => null));
}

/** Promise façade. */
export async function loadPipelineConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<InferencePipelineConfig | null> {
  return Effect.runPromise(loadPipelineConfigEffect(env));
}

export function savePipelineConfigEffect(
  config: InferencePipelineConfig,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: async () => {
      const path = resolvePipelineConfigPath(env);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      return path;
    },
    catch: asError,
  });
}

/** Promise façade. */
export async function savePipelineConfig(
  config: InferencePipelineConfig,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  return Effect.runPromise(savePipelineConfigEffect(config, env));
}

export function buildPipelineConfig(
  input: Partial<InferencePipelineConfig> = {}
): InferencePipelineConfig {
  return {
    ...DEFAULT_PIPELINE_CONFIG,
    ...input,
    updatedAt: new Date().toISOString(),
  };
}
