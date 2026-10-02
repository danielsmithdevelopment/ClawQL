import { resolveInferencePolicy } from "../policy/resolve.js";
import { Effect } from "effect";

export type InferencePolicyShowOptions = {
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runInferencePolicyShowImpl(
  options: InferencePolicyShowOptions = {}
): Promise<number>  {
  const env = options.env ?? process.env;
  const policy = resolveInferencePolicy(env);

  if (options.json) {
    console.log(JSON.stringify(policy, null, 2));
    return 0;
  }

  console.log(`policy_source: ${policy.source}`);
  if (policy.manifestPath) console.log(`manifest_path: ${policy.manifestPath}`);
  if (policy.policyVersion) console.log(`policy_version: ${policy.policyVersion}`);
  console.log(`escalation_enabled: ${policy.escalation.enabled}`);
  console.log(`semantic_cache: ${policy.cache.enabled}`);
  console.log(`fallback_enabled: ${policy.fallback.enabled}`);
  console.log(`virtual_keys_enabled: ${policy.keys.enabled}`);
  console.log(
    `store_backend: ${policy.store.backend}${policy.store.path ? ` (${policy.store.path})` : ""}`
  );
  if (policy.store.backend === "postgres") {
    console.log(`postgres_configured: ${policy.store.postgresConfigured}`);
  }
  console.log(`pipeline_worker: ${policy.pipelineWorker.enabled}`);
  console.log(`agent_coordination: ${policy.agentCoordination.enabled}`);
  return 0;
}

export function runInferencePolicyShowEffect(
  options: InferencePolicyShowOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferencePolicyShowImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferencePolicyShowEffect} for Effect callers. */
export async function runInferencePolicyShow(
  options: InferencePolicyShowOptions = {}
): Promise<number>  {
  return Effect.runPromise(runInferencePolicyShowEffect(options));
}
