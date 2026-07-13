import { resolve } from "node:path";
import { Context, Layer } from "effect";
import { DEFAULT_OBSIDIAN_VAULT_PATH, getObsidianVaultPath } from "../vault/config.js";

export { DEFAULT_OBSIDIAN_VAULT_PATH };

/** Effect service for Obsidian vault path configuration. */
export class VaultConfigService extends Context.Tag("clawql/VaultConfigService")<
  VaultConfigService,
  {
    readonly getObsidianVaultPath: () => string | null;
  }
>() {}

export function vaultConfigServiceFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return VaultConfigService.of({
    getObsidianVaultPath: () => {
      const raw = env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim();
      if (raw === undefined || raw === "") {
        return null;
      }
      return resolve(raw);
    },
  });
}

/** Live config — re-reads `process.env` on each accessor. */
export function vaultConfigLiveService() {
  return VaultConfigService.of({
    getObsidianVaultPath: () => getObsidianVaultPath(),
  });
}

export const VaultConfigLive = Layer.succeed(VaultConfigService, vaultConfigLiveService());

export function createVaultConfigTestLayer(env: NodeJS.ProcessEnv): Layer.Layer<VaultConfigService> {
  return Layer.succeed(VaultConfigService, vaultConfigServiceFromEnv(env));
}

/** Re-read env on each call (matches {@link getObsidianVaultPath} for live process.env). */
export const vaultConfigLiveLayer = (): Layer.Layer<VaultConfigService> => VaultConfigLive;
