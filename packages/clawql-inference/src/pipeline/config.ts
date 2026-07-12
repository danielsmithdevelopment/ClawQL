import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_PIPELINE_CONFIG, type InferencePipelineConfig } from "./types.js";

const FILE_NAME = "pipeline.json";

export function resolvePipelineConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Inference", FILE_NAME);
}

export async function loadPipelineConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<InferencePipelineConfig | null> {
  try {
    const raw = await readFile(resolvePipelineConfigPath(env), "utf8");
    return JSON.parse(raw) as InferencePipelineConfig;
  } catch {
    return null;
  }
}

export async function savePipelineConfig(
  config: InferencePipelineConfig,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const path = resolvePipelineConfigPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return path;
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
