import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { EmbeddingService, embeddingLiveLayer } from "./embedding-service.js";
import { MemoryDbService, memoryDbLiveLayer } from "./memory-db-service.js";
import {
  VaultConfigService,
  createVaultConfigTestLayer,
  vaultConfigLiveLayer,
} from "./vault-config-service.js";

describe("VaultConfigService", () => {
  it("returns null when vault env is unset", async () => {
    const path = await Effect.runPromise(
      Effect.gen(function* () {
        const config = yield* VaultConfigService;
        return config.getObsidianVaultPath();
      }).pipe(Effect.provide(createVaultConfigTestLayer({})))
    );
    expect(path).toBeNull();
  });

  it("resolves vault path from env", async () => {
    const path = await Effect.runPromise(
      Effect.gen(function* () {
        const config = yield* VaultConfigService;
        return config.getObsidianVaultPath();
      }).pipe(
        Effect.provide(createVaultConfigTestLayer({ CLAWQL_OBSIDIAN_VAULT_PATH: "/tmp/vault" }))
      )
    );
    expect(path).toBe("/tmp/vault");
  });
});

describe("MemoryDbService", () => {
  it("exposes sync enabled flags", async () => {
    const flags = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* MemoryDbService;
        return {
          sync: db.memoryDbSyncEnabled(),
          recallSync: db.recallSyncDbEnabled(),
        };
      }).pipe(Effect.provide(memoryDbLiveLayer()))
    );
    expect(typeof flags.sync).toBe("boolean");
    expect(typeof flags.recallSync).toBe("boolean");
  });
});

describe("EmbeddingService", () => {
  it("exposes embedding config resolution", async () => {
    const cfg = await Effect.runPromise(
      Effect.gen(function* () {
        const embedding = yield* EmbeddingService;
        return embedding.resolveEmbeddingConfig();
      }).pipe(Effect.provide(embeddingLiveLayer()))
    );
    expect(cfg === null || typeof cfg?.model === "string").toBe(true);
  });
});

describe("memoryServicesLiveLayer", () => {
  it("merges vault config layer", async () => {
    const path = await Effect.runPromise(
      Effect.gen(function* () {
        const config = yield* VaultConfigService;
        return config.getObsidianVaultPath();
      }).pipe(Effect.provide(vaultConfigLiveLayer()))
    );
    expect(path === null || typeof path === "string").toBe(true);
  });
});
