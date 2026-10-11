/**
 * Shared ClawQL env for equal-arm gateway benches.
 *
 * 8.0: CLAWQL_ENABLE_* is ignored without CLAWQL_INSTANCE_SPEC (falls through to
 * CLAWQL_TIER or standard — memory + ChatGPT extensions stay on). Fake
 * CLAWQL_TIER=gateway is not a real preset → standard. Always set INSTANCE_SPEC.
 */
export function clawqlEqualArmInstanceSpec() {
  return {
    tier: "local",
    memory: { enabled: false },
    documents: { enabled: false },
    chatgptExtensions: { enabled: false },
    observability: { enabled: false },
    sandbox: { enabled: false },
    data: { enabled: false },
    ouroboros: { enabled: false },
    automation: {
      schedule: { enabled: false },
      notify: { enabled: false },
      workflow: { enabled: false },
      argocd: { enabled: false },
      hitlLabelStudio: { enabled: false },
    },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.home
 * @param {string} opts.specPath
 * @param {string} opts.apiBase
 * @param {NodeJS.ProcessEnv} [opts.baseEnv]
 */
export function clawqlEqualArmEnv({ home, specPath, apiBase, baseEnv = process.env }) {
  const env = {
    ...baseEnv,
    CLAWQL_HOME: home,
    CLAWQL_OBSIDIAN_VAULT_PATH: home,
    CLAWQL_SPEC_PATH: specPath,
    CLAWQL_API_BASE_URL: apiBase,
    CLAWQL_BUNDLED_OFFLINE: "1",
    CLAWQL_TIER: "local",
    CLAWQL_INSTANCE_SPEC: JSON.stringify(clawqlEqualArmInstanceSpec()),
    CLAWQL_CAPABILITY_LIFECYCLE: "0",
    CLAWQL_ALLOW_NO_ENFORCEMENT: "1",
    CLAWQL_OPENAPI_EXECUTE_PATH: "rest",
  };
  for (const key of [
    "CLAWQL_PROVIDER",
    "CLAWQL_BUNDLED_PROVIDERS",
    "CLAWQL_INSTANCE_SPEC_FILE",
    "CLAWQL_SPEC_URL",
    "CLAWQL_SPEC_PATHS",
    "CLAWQL_DISCOVERY_URL",
  ]) {
    delete env[key];
  }
  delete env.CLAWQL_WORM_ENABLED;
  delete env.CLAWQL_WORM_LOCAL;
  delete env.CLAWQL_WORM_REMOTE;
  // Legacy ENABLE_* — harmless with INSTANCE_SPEC, but keep intent explicit.
  env.CLAWQL_ENABLE_MEMORY = "0";
  env.CLAWQL_ENABLE_DOCUMENTS = "0";
  env.CLAWQL_ENABLE_ONYX = "0";
  env.CLAWQL_ENABLE_SANDBOX = "0";
  env.CLAWQL_ENABLE_SCHEDULE = "0";
  env.CLAWQL_ENABLE_NOTIFY = "0";
  env.CLAWQL_ENABLE_OBSERVABILITY = "0";
  env.CLAWQL_ENABLE_GOOGLE = "0";
  env.CLAWQL_ENABLE_AWS = "0";
  env.CLAWQL_ENABLE_CHATGPT_EXTENSIONS = "0";
  return env;
}
