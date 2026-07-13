import { Effect } from "effect";
import {
  executeMemoryRecallCore,
  type MemoryRecallInput,
  type MemoryRecallResult,
} from "../recall/recall.js";
import { MemoryError } from "./memory-errors.js";
import { memoryFromPromise } from "./memory-effect-utils.js";
import { VaultConfigService } from "./vault-config-service.js";

const VAULT_NOT_CONFIGURED =
  "Obsidian vault is not configured. Set CLAWQL_OBSIDIAN_VAULT_PATH to a writable directory.";

/** Recall pipeline as Effect.gen — vault path via {@link VaultConfigService}. */
export function executeMemoryRecallEffect(
  input: MemoryRecallInput
): Effect.Effect<MemoryRecallResult, MemoryError, VaultConfigService> {
  return Effect.gen(function* () {
    const vaultConfig = yield* VaultConfigService;
    const vault = vaultConfig.getObsidianVaultPath();
    if (!vault) {
      return { ok: false, error: VAULT_NOT_CONFIGURED };
    }
    return yield* memoryFromPromise(() => executeMemoryRecallCore(vault, input));
  });
}
