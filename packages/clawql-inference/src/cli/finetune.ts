import { getFinetuneJobStatus, registerFinetuneModel, submitFinetuneJob } from "../finetune/jobs.js";
import type { FinetuneProvider } from "../finetune/types.js";
import type { ModelTier } from "../routing/types.js";

export type InferenceFinetuneOptions = {
  dataset?: string;
  manifest?: string;
  baseModel?: string;
  provider?: FinetuneProvider;
  registerAs?: string;
  jobId?: string;
  tier?: ModelTier;
  alias?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runInferenceFinetune(options: InferenceFinetuneOptions): Promise<number> {
  if (!options.dataset?.trim()) {
    console.error(
      "Usage: clawql inference finetune --dataset <path.jsonl> --base-model <model> --provider openai|anthropic"
    );
    return 1;
  }
  if (!options.baseModel?.trim()) {
    console.error("Missing --base-model");
    return 1;
  }
  const provider = options.provider ?? "openai";
  try {
    const job = await submitFinetuneJob({
      datasetPath: options.dataset.trim(),
      manifestPath: options.manifest,
      baseModel: options.baseModel.trim(),
      provider,
      registerAs: options.registerAs,
      env: options.env,
    });
    if (options.json) {
      console.log(JSON.stringify(job, null, 2));
    } else {
      console.log(`Submitted ${provider} fine-tune job ${job.id} (status: ${job.status})`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function runInferenceFinetuneStatus(
  options: InferenceFinetuneOptions
): Promise<number> {
  if (!options.jobId?.trim()) {
    console.error("Usage: clawql inference finetune status --job-id <id> --provider openai|anthropic");
    return 1;
  }
  const provider = options.provider ?? "openai";
  try {
    const job = await getFinetuneJobStatus({
      jobId: options.jobId.trim(),
      provider,
      env: options.env,
    });
    if (options.json) {
      console.log(JSON.stringify(job, null, 2));
    } else {
      console.log(
        `${job.id}: ${job.status}${job.fineTunedModel ? ` → ${job.fineTunedModel}` : ""}${
          job.error ? ` (${job.error})` : ""
        }`
      );
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function runInferenceFinetuneRegister(
  options: InferenceFinetuneOptions
): Promise<number> {
  if (!options.jobId?.trim() || !options.tier || !options.alias?.trim()) {
    console.error(
      "Usage: clawql inference finetune register --job-id <id> --tier frugal|standard|frontier --alias <provider/model>"
    );
    return 1;
  }
  try {
    const result = await registerFinetuneModel({
      jobId: options.jobId.trim(),
      tier: options.tier,
      alias: options.alias.trim(),
      provider: options.provider,
      env: options.env,
    });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Registered ${result.modelId} as ${result.tier} tier (saved to ${result.path})`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
