import { Context, Effect, Layer } from "effect";
import type { ModelTier } from "../routing/types.js";
import { getAnthropicFinetuneJobEffect, submitAnthropicFinetuneJobEffect } from "./anthropic.js";
import { getOpenAiFinetuneJobEffect, submitOpenAiFinetuneJobEffect } from "./openai.js";
import { registerModelToTierEffect } from "./tier-registry.js";
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

export function submitFinetuneJobEffect(
  input: SubmitFinetuneJobInput
): Effect.Effect<FinetuneJob, Error> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    const apiKey = resolveApiKey(input.provider, env);
    const job =
      input.provider === "openai"
        ? yield* submitOpenAiFinetuneJobEffect({
            datasetPath: input.datasetPath,
            baseModel: input.baseModel,
            suffix: input.suffix ?? input.registerAs,
            apiKey,
          })
        : yield* submitAnthropicFinetuneJobEffect({
            datasetPath: input.datasetPath,
            baseModel: input.baseModel,
            apiKey,
          });

    if (input.registerAs && job.fineTunedModel) {
      yield* registerModelToTierEffect("frugal", job.fineTunedModel, env);
    }
    return job;
  });
}

/** Promise façade. */
export async function submitFinetuneJob(input: SubmitFinetuneJobInput): Promise<FinetuneJob> {
  return Effect.runPromise(submitFinetuneJobEffect(input));
}

export function getFinetuneJobStatusEffect(input: {
  jobId: string;
  provider: FinetuneProvider;
  env?: NodeJS.ProcessEnv;
}): Effect.Effect<FinetuneJob, Error> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    const apiKey = resolveApiKey(input.provider, env);
    return input.provider === "openai"
      ? yield* getOpenAiFinetuneJobEffect(input.jobId, apiKey)
      : yield* getAnthropicFinetuneJobEffect(input.jobId, apiKey);
  });
}

/** Promise façade. */
export async function getFinetuneJobStatus(input: {
  jobId: string;
  provider: FinetuneProvider;
  env?: NodeJS.ProcessEnv;
}): Promise<FinetuneJob> {
  return Effect.runPromise(getFinetuneJobStatusEffect(input));
}

export function registerFinetuneModelEffect(
  input: RegisterFinetuneModelInput & { provider?: FinetuneProvider; modelId?: string }
): Effect.Effect<{ tier: ModelTier; modelId: string; path: string }, Error> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    let modelId = input.modelId ?? input.alias;
    if (!modelId && input.provider) {
      const job = yield* getFinetuneJobStatusEffect({
        jobId: input.jobId,
        provider: input.provider,
        env,
      });
      modelId = job.fineTunedModel ?? input.alias;
    }
    if (!modelId?.trim()) {
      return yield* Effect.fail(
        new Error("Model id is required (pass --alias or a succeeded job with fineTunedModel)")
      );
    }
    const { path } = yield* registerModelToTierEffect(input.tier, modelId.trim(), env);
    return { tier: input.tier, modelId: modelId.trim(), path };
  });
}

/** Promise façade. */
export async function registerFinetuneModel(
  input: RegisterFinetuneModelInput & { provider?: FinetuneProvider; modelId?: string }
): Promise<{ tier: ModelTier; modelId: string; path: string }> {
  return Effect.runPromise(registerFinetuneModelEffect(input));
}

export class FinetuneJobsService extends Context.Service<
  FinetuneJobsService,
  {
    readonly submit: (input: SubmitFinetuneJobInput) => Effect.Effect<FinetuneJob, Error>;
    readonly getStatus: (input: {
      jobId: string;
      provider: FinetuneProvider;
      env?: NodeJS.ProcessEnv;
    }) => Effect.Effect<FinetuneJob, Error>;
    readonly register: (
      input: RegisterFinetuneModelInput & { provider?: FinetuneProvider; modelId?: string }
    ) => Effect.Effect<{ tier: ModelTier; modelId: string; path: string }, Error>;
  }
>()("clawql/FinetuneJobsService") {}

export function finetuneJobsLiveLayer(): Layer.Layer<FinetuneJobsService> {
  return Layer.succeed(
    FinetuneJobsService,
    FinetuneJobsService.of({
      submit: submitFinetuneJobEffect,
      getStatus: getFinetuneJobStatusEffect,
      register: registerFinetuneModelEffect,
    })
  );
}
