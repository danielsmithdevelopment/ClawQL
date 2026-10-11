import { createInferenceGateway } from "../gateway.js";
import { Effect } from "effect";

export type InferenceCompleteOptions = {
  model: string;
  message: string;
  correlationId?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runInferenceCompleteImpl(options: InferenceCompleteOptions): Promise<number> {
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

export function runInferenceCompleteEffect(
  options: InferenceCompleteOptions
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferenceCompleteImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferenceCompleteEffect} for Effect callers. */
export async function runInferenceComplete(options: InferenceCompleteOptions): Promise<number> {
  return Effect.runPromise(runInferenceCompleteEffect(options));
}
