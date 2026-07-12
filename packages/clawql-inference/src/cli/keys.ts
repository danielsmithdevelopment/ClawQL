import {
  createVirtualKey,
  listVirtualKeys,
  redactVirtualKey,
  revokeVirtualKey,
} from "../keys/store.js";
import { loadKeysConfig, resolveVirtualKeysPath } from "../keys/config.js";

export type InferenceKeysCreateOptions = {
  team?: string;
  budgetUsd?: number;
  rateLimit?: string;
  label?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runInferenceKeysCreate(
  options: InferenceKeysCreateOptions = {}
): Promise<number> {
  if (!options.team?.trim()) {
    console.error(
      "Usage: clawql inference keys create --team <name> [--budget-usd N] [--rate-limit 100rpm] [--label NAME]"
    );
    return 1;
  }

  const env = options.env ?? process.env;
  const { key, secret, path } = await createVirtualKey(
    {
      team: options.team,
      budgetUsd: options.budgetUsd,
      rateLimit: options.rateLimit,
      label: options.label,
    },
    env
  );

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          id: key.id,
          team: key.team,
          secret,
          budgetUsd: key.budgetUsd,
          rateLimit: key.rateLimit,
          label: key.label,
          path,
        },
        null,
        2
      )
    );
    return 0;
  }

  console.log(`Created virtual key ${key.id} for team "${key.team}"`);
  console.log(`Secret (shown once): ${secret}`);
  if (key.budgetUsd !== undefined) console.log(`Budget: $${key.budgetUsd}`);
  if (key.rateLimit) {
    console.log(`Rate limit: ${key.rateLimit.maxRequests} per ${key.rateLimit.windowMs}ms`);
  }
  console.log(`Saved to ${path}`);
  return 0;
}

export type InferenceKeysListOptions = {
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runInferenceKeysList(
  options: InferenceKeysListOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  const config = loadKeysConfig(env);
  const keys = listVirtualKeys(env).map(redactVirtualKey);
  const payload = {
    enabled: config.enabled,
    keysPath: resolveVirtualKeysPath(env),
    keys,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  console.log(`keys_enabled: ${config.enabled}`);
  console.log(`keys_file: ${payload.keysPath}`);
  if (!keys.length) {
    console.log("No virtual keys configured.");
    return 0;
  }

  for (const key of keys) {
    const status = key.revokedAt ? "revoked" : "active";
    const budget =
      key.budgetUsd !== undefined ? `$${key.spentUsd.toFixed(4)}/$${key.budgetUsd}` : "unlimited";
    console.log(
      `${key.id}  team=${key.team}  status=${status}  budget=${budget}  created=${key.createdAt}`
    );
  }
  return 0;
}

export type InferenceKeysRevokeOptions = {
  id?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runInferenceKeysRevoke(
  options: InferenceKeysRevokeOptions = {}
): Promise<number> {
  if (!options.id?.trim()) {
    console.error("Usage: clawql inference keys revoke --id <vk_...>");
    return 1;
  }

  const env = options.env ?? process.env;
  const result = await revokeVirtualKey(options.id.trim(), env);
  if (!result) {
    console.error(`Virtual key not found: ${options.id}`);
    return 1;
  }

  if (options.json) {
    console.log(JSON.stringify({ key: redactVirtualKey(result.key), path: result.path }, null, 2));
    return 0;
  }

  console.log(`Revoked ${result.key.id} (saved to ${result.path})`);
  return 0;
}
