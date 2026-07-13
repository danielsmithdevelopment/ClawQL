/**
 * Post-write vault index sync via MemoryDbService (ingest, external ingest, recall).
 */

import { Effect, Exit } from "effect";
import type { MerkleSnapshotPayload } from "../ingest/ingest.js";
import { MemoryDbService } from "./memory-db-service.js";
import { memoryFromPromise } from "./memory-effect-utils.js";

export type VaultPostSyncExtras = {
  merkleSnapshotBefore?: MerkleSnapshotPayload | null;
  merkleSnapshot?: MerkleSnapshotPayload | null;
  merkleRootChanged?: boolean;
  cuckooMembershipReady?: boolean;
};

export type VaultArtifactHints = {
  merkleSnapshot?: MerkleSnapshotPayload | null;
  cuckooMembershipReady?: boolean;
};

function envFlagEnabled(key: string): boolean {
  return process.env[key] === "1";
}

/** Current merkle row + cuckoo flag when memory.db sync is enabled (dry-run hints). */
export function vaultArtifactHintsEffect(
  vault: string
): Effect.Effect<VaultArtifactHints, never, MemoryDbService> {
  return Effect.gen(function* () {
    const db = yield* MemoryDbService;
    const hints: VaultArtifactHints = {};
    if (!db.memoryDbSyncEnabled()) {
      return hints;
    }
    if (envFlagEnabled("CLAWQL_MERKLE_ENABLED")) {
      const merkleSnapshot = yield* db.loadVaultMerkleSnapshotFromDb(vault).pipe(
        Effect.catchAll((err) =>
          Effect.sync(() => {
            console.error(`[clawql-mcp] memory.db merkle snapshot hint load failed: ${err.reason}`);
            return null;
          })
        )
      );
      hints.merkleSnapshot = merkleSnapshot;
    }
    if (envFlagEnabled("CLAWQL_CUCKOO_ENABLED")) {
      hints.cuckooMembershipReady = true;
    }
    return hints;
  });
}

/** Sync memory.db scan root only. */
export function vaultDbScanSyncEffect(vault: string): Effect.Effect<void, never, MemoryDbService> {
  return Effect.gen(function* () {
    const db = yield* MemoryDbService;
    if (!db.memoryDbSyncEnabled()) return;
    yield* db.syncMemoryDbForVaultScanRoot(vault).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          console.error(`[clawql-mcp] memory.db sync failed: ${err.reason}`);
        })
      )
    );
  });
}

/** Update vault provider index page after writes. */
export function vaultProviderIndexEffect(vault: string): Effect.Effect<void, never> {
  return memoryFromPromise(async () => {
    const { updateProviderIndexPage } = await import("../vault/provider-index.js");
    await updateProviderIndexPage(vault);
  }).pipe(
    Effect.catchAll((err) =>
      Effect.sync(() => {
        console.error(`[clawql-mcp] provider index update failed: ${err.reason}`);
      })
    )
  );
}

/** Sync memory.db scan root + update provider index page after vault writes. */
export function vaultWritePostSyncEffect(
  vault: string
): Effect.Effect<void, never, MemoryDbService> {
  return Effect.gen(function* () {
    yield* vaultDbScanSyncEffect(vault);
    yield* vaultProviderIndexEffect(vault);
  });
}

/** Post-ingest memory.db sync with merkle before/after and cuckoo membership flag. */
export function memoryIngestPostSyncExtrasEffect(
  vault: string
): Effect.Effect<VaultPostSyncExtras, never, MemoryDbService> {
  return Effect.gen(function* () {
    const db = yield* MemoryDbService;
    const extras: VaultPostSyncExtras = {};
    const merkleOn = envFlagEnabled("CLAWQL_MERKLE_ENABLED");

    let merkleBefore: MerkleSnapshotPayload | null | undefined;
    if (merkleOn && db.memoryDbSyncEnabled()) {
      merkleBefore = yield* db.loadVaultMerkleSnapshotFromDb(vault).pipe(
        Effect.catchAll((err) =>
          Effect.sync(() => {
            console.error(
              `[clawql-mcp] memory.db merkle snapshot (before ingest sync) failed: ${err.reason}`
            );
            return null;
          })
        )
      );
    }

    if (!db.memoryDbSyncEnabled()) {
      return extras;
    }

    const syncExit = yield* Effect.exit(vaultDbScanSyncEffect(vault));
    if (Exit.isFailure(syncExit)) {
      const reason = syncExit.cause;
      console.error(`[clawql-mcp] memory.db sync after ingest failed: ${String(reason)}`);
      return extras;
    }

    if (envFlagEnabled("CLAWQL_CUCKOO_ENABLED")) {
      extras.cuckooMembershipReady = true;
    }

    if (merkleOn) {
      const merkleAfter = yield* db.loadVaultMerkleSnapshotFromDb(vault).pipe(
        Effect.catchAll((err) =>
          Effect.sync(() => {
            console.error(
              `[clawql-mcp] memory.db merkle snapshot (after ingest sync) failed: ${err.reason}`
            );
            return null;
          })
        )
      );
      const merklePrior = merkleBefore ?? null;
      extras.merkleSnapshotBefore = merklePrior;
      extras.merkleSnapshot = merkleAfter;
      extras.merkleRootChanged =
        merkleAfter === null
          ? undefined
          : merklePrior === null
            ? true
            : merklePrior.rootHex !== merkleAfter.rootHex;
    }

    return extras;
  });
}
