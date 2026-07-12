import type { ModelTier } from "../routing/types.js";
import { getAnthropicFinetuneJob, submitAnthropicFinetuneJob } from "./anthropic.js";
import { getOpenAiFinetuneJob, submitOpenAiFinetuneJob } from "./openai.js";
import { registerModelToTier } from "./tier-registry.js";
import type {
  FinetuneJob,
  FinetuneProvider,
  RegisterFinetuneModelInput,
  SubmitFinetuneJobInput,
} from "./types.js";

function resolveApiKey(provider: FinetuneProvider, env: NodeJS.ProcessEnv): string {
  const key = provider === "openai" ? env.OPENAI_API_KEY?.trim() : env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error(
      provider === "openai"
        ? "OPENAI_API_KEY is required for OpenAI fine-tuning"
        : "ANTHROPIC_API_KEY is required for Anthropic fine-tuning"
    );
  }
  return key;
}

export async function submitFinetuneJob(input: SubmitFinetuneJobInput): Promise<FinetuneJob> {
  const env = input.env ?? process.env;
  const apiKey = resolveApiKey(input.provider, env);
  const job =
    input.provider === "openai"
      ? await submitOpenAiFinetuneJob({
          datasetPath: input.datasetPath,
          baseModel: input.baseModel,
          suffix: input.suffix ?? input.registerAs,
          apiKey,
        })
      : await submitAnthropicFinetuneJob({
          datasetPath: input.datasetPath,
          baseModel: input.baseModel,
          apiKey,
        });

  if (input.registerAs && job.fineTunedModel) {
    await registerModelToTier("frugal", job.fineTunedModel, env);
  }
  return job;
}

export async function getFinetuneJobStatus(input: {
  jobId: string;
  provider: FinetuneProvider;
  env?: NodeJS.ProcessEnv;
}): Promise<FinetuneJob> {
  const env = input.env ?? process.env;
  const apiKey = resolveApiKey(input.provider, env);
  return input.provider === "openai"
    ? getOpenAiFinetuneJob(input.jobId, apiKey)
    : getAnthropicFinetuneJob(input.jobId, apiKey);
}

export async function registerFinetuneModel(
  input: RegisterFinetuneModelInput & { provider?: FinetuneProvider; modelId?: string }
): Promise<{ tier: ModelTier; modelId: string; path: string }> {
  const env = input.env ?? process.env;
  let modelId = input.modelId ?? input.alias;
  if (!modelId && input.provider) {
    const job = await getFinetuneJobStatus({
      jobId: input.jobId,
      provider: input.provider,
      env,
    });
    modelId = job.fineTunedModel ?? input.alias;
  }
  if (!modelId?.trim()) {
    throw new Error("Model id is required (pass --alias or a succeeded job with fineTunedModel)");
  }
  const { path } = await registerModelToTier(input.tier, modelId.trim(), env);
  return { tier: input.tier, modelId: modelId.trim(), path };
}
