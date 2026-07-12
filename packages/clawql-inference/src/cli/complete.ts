import { createInferenceGateway } from "../gateway.js";

export type InferenceCompleteOptions = {
  model: string;
  message: string;
  correlationId?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runInferenceComplete(options: InferenceCompleteOptions): Promise<number> {
  const gateway = createInferenceGateway({ env: options.env });
  const result = await gateway.complete({
    model: options.model,
    messages: [{ role: "user", content: options.message }],
    correlationId: options.correlationId,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.content);
    if (result.usage) {
      console.error(
        `[tokens in=${result.usage.inputTokens} out=${result.usage.outputTokens} model=${result.model}]`
      );
    }
  }
  return 0;
}
