import { Effect } from "effect";
import {
  prepareMemoryIngestEffectiveInput,
  writeMemoryIngestPage,
  type MemoryIngestInput,
  type MemoryIngestResult,
} from "../ingest/ingest.js";
import { MemoryError } from "./memory-errors.js";
import { memoryFromPromise } from "./memory-effect-utils.js";
import { MemoryDbService } from "./memory-db-service.js";
import {
  memoryIngestPostSyncExtrasEffect,
  vaultProviderIndexEffect,
} from "./memory-vault-post-sync-effect.js";
import { VaultConfigService } from "./vault-config-service.js";

const VAULT_NOT_CONFIGURED =
  "Obsidian vault is not configured. Set CLAWQL_OBSIDIAN_VAULT_PATH to a writable directory.";

export type MemoryIngestServices = VaultConfigService | MemoryDbService;

function wantEmbeddingsRebuild(effective: MemoryIngestInput): boolean {
  return (
    effective.rebuild?.embeddings !== false &&
    (effective.rebuild?.embeddings === true || process.env.CLAWQL_MEMORY_DB?.trim() !== "0")
  );
}

function wantPageIndexRebuild(effective: MemoryIngestInput): boolean {
  return (
    effective.rebuild?.pageindex === true ||
    process.env.CLAWQL_MEMORY_INGEST_REBUILD_PAGEINDEX?.trim() === "1"
  );
}

/**
 * Vault write + post-sync / rebuild as Effect.gen.
 * fs / Presidio stay behind {@link memoryFromPromise}; db sync via {@link MemoryDbService}.
 */
export function executeMemoryIngestCoreEffect(
  vault: string,
  input: MemoryIngestInput
): Effect.Effect<MemoryIngestResult, MemoryError, MemoryDbService> {
  return Effect.gen(function* () {
    const prepared = yield* memoryFromPromise(() => prepareMemoryIngestEffectiveInput(input));
    if (!prepared.ok) {
      return { ok: false, error: prepared.error };
    }

    const { title, effective, fileProvenance } = prepared;
    const result = yield* memoryFromPromise(() =>
      writeMemoryIngestPage(vault, title, effective, fileProvenance)
    );

    if (!result.ok || result.skipped) {
      return result;
    }

    const rebuild: NonNullable<MemoryIngestResult["rebuild"]> = {};
    let extras: Partial<MemoryIngestResult> = {};

    if (wantEmbeddingsRebuild(effective)) {
      extras = yield* memoryIngestPostSyncExtrasEffect(vault);
      rebuild.embeddings = { synced: true };
    } else if (effective.rebuild?.embeddings === false) {
      rebuild.embeddings = {
        synced: false,
        skipped: "rebuild.embeddings=false; memory.db / embedding sync skipped",
      };
    }

    yield* vaultProviderIndexEffect(vault);

    if (wantPageIndexRebuild(effective) && result.path) {
      rebuild.pageindex = yield* memoryFromPromise(async () => {
        try {
          const { pageindexBuildFromVaultPath } = await import("../recall/pageindex-recall.js");
          const docId = result.path!.replace(/^Memory\//, "").replace(/\.md$/i, "");
          return await pageindexBuildFromVaultPath({
            docId,
            vaultRelativePath: result.path!,
          });
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : String(e),
          };
        }
      });
    }

    yield* memoryFromPromise(async () => {
      const { runAfterIngestVaultSync } = await import("../sync/vault-sync-hooks.js");
      await runAfterIngestVaultSync();
    });

    return {
      ...result,
      ...extras,
      rebuild: Object.keys(rebuild).length > 0 ? rebuild : undefined,
    };
  });
}

/** Ingest pipeline as Effect.gen — vault path via {@link VaultConfigService}. */
export function executeMemoryIngestEffect(
  input: MemoryIngestInput
): Effect.Effect<MemoryIngestResult, MemoryError, MemoryIngestServices> {
  return Effect.gen(function* () {
    const vaultConfig = yield* VaultConfigService;
    const vault = vaultConfig.getObsidianVaultPath();
    if (!vault) {
      return { ok: false, error: VAULT_NOT_CONFIGURED };
    }
    return yield* executeMemoryIngestCoreEffect(vault, input);
  });
}
