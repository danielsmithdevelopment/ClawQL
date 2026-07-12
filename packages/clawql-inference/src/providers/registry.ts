import { composeDefaultProviderPlugins } from "../plugin/compose.js";
import type {
  CreateProviderRegistryOptions,
  InferenceProviderPlugin,
  ProviderRegistry,
} from "./types.js";

export function getProviderAdapter(
  registry: ProviderRegistry,
  provider: string
): import("./types.js").InferenceProviderAdapter | undefined {
  return registry.get(provider.trim().toLowerCase());
}

export function resolveProviderPluginFlags(env: NodeJS.ProcessEnv = process.env): {
  allowlist?: string[];
  denylist?: string[];
} {
  const allowRaw = env.CLAWQL_INFERENCE_PROVIDERS?.trim();
  const denyRaw = env.CLAWQL_INFERENCE_DISABLE_PROVIDERS?.trim();
  const allowlist = allowRaw
    ? allowRaw
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
    : undefined;
  const denylist = denyRaw
    ? denyRaw
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
    : undefined;
  return { allowlist, denylist };
}

function shouldRegisterProvider(
  pluginId: string,
  options: Pick<CreateProviderRegistryOptions, "allowlist" | "denylist">
): boolean {
  const id = pluginId.trim().toLowerCase();
  if (options.denylist?.includes(id)) return false;
  if (options.allowlist && !options.allowlist.includes(id)) return false;
  return true;
}

export function registerProviderPlugins(
  plugins: readonly InferenceProviderPlugin[],
  options: CreateProviderRegistryOptions = {}
): ProviderRegistry {
  const env = options.env ?? process.env;
  const registry: ProviderRegistry = new Map();
  const flags = {
    allowlist: options.allowlist ?? resolveProviderPluginFlags(env).allowlist,
    denylist: options.denylist ?? resolveProviderPluginFlags(env).denylist,
  };

  for (const plugin of plugins) {
    if (!shouldRegisterProvider(plugin.id, flags)) continue;
    plugin.onRegister({ env, registry });
  }

  return registry;
}

export function createProviderRegistry(
  options: CreateProviderRegistryOptions | NodeJS.ProcessEnv = {}
): ProviderRegistry {
  const normalized: CreateProviderRegistryOptions =
    "env" in options || "plugins" in options || "allowlist" in options || "denylist" in options
      ? (options as CreateProviderRegistryOptions)
      : { env: options as NodeJS.ProcessEnv };

  return registerProviderPlugins(normalized.plugins ?? composeDefaultProviderPlugins(), normalized);
}
