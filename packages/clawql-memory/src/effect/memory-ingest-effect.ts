import { Effect } from "effect";
import {
  executeMemoryIngestCore,
  type MemoryIngestInput,
  type MemoryIngestResult,
} from "../ingest/ingest.js";
import { MemoryError } from "./memory-errors.js";
import { memoryFromPromise } from "./memory-effect-utils.js";
import { VaultConfigService } from "./vault-config-service.js";

const VAULT_NOT_CONFIGURED =
  "Obsidian vault is not configured. Set CLAWQL_OBSIDIAN_VAULT_PATH to a writable directory.";

/** Ingest pipeline as Effect.gen — vault path via {@link VaultConfigService}. */
export function executeMemoryIngestEffect(
  input: MemoryIngestInput
): Effect.Effect<MemoryIngestResult, MemoryError, VaultConfigService> {
  return Effect.gen(function* () {
    const vaultConfig = yield* VaultConfigService;
    const vault = vaultConfig.getObsidianVaultPath();
    if (!vault) {
      return { ok: false, error: VAULT_NOT_CONFIGURED };
    }
    return yield* memoryFromPromise(() => executeMemoryIngestCore(vault, input));
  });
}
