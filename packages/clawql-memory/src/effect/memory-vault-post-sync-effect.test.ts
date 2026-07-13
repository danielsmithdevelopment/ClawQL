import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { MemoryDbService, memoryDbLiveLayer } from "./memory-db-service.js";
import {
  memoryIngestPostSyncExtrasEffect,
  vaultArtifactHintsEffect,
  vaultWritePostSyncEffect,
} from "./memory-vault-post-sync-effect.js";

describe("memory vault post-sync effects", () => {
  it("vaultArtifactHintsEffect returns empty when sync disabled", async () => {
    const hints = await Effect.runPromise(
      vaultArtifactHintsEffect("/tmp/vault").pipe(Effect.provide(memoryDbLiveLayer()))
    );
    expect(hints).toEqual({});
  });

  it("memoryIngestPostSyncExtrasEffect returns empty when sync disabled", async () => {
    const extras = await Effect.runPromise(
      memoryIngestPostSyncExtrasEffect("/tmp/vault").pipe(Effect.provide(memoryDbLiveLayer()))
    );
    expect(extras).toEqual({});
  });

  it("vaultWritePostSyncEffect completes when sync disabled", async () => {
    await Effect.runPromise(
      vaultWritePostSyncEffect("/tmp/vault").pipe(Effect.provide(memoryDbLiveLayer()))
    );
    const db = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* MemoryDbService;
      }).pipe(Effect.provide(memoryDbLiveLayer()))
    );
    expect(db.memoryDbSyncEnabled()).toBe(false);
  });
});
