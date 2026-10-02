import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    for (const key of [
      "CLAWQL_MEMORY_DB",
      "CLAWQL_MEMORY_DB_SYNC_ON_RECALL",
      "CLAWQL_OBSIDIAN_VAULT_PATH",
    ] as const) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      const v = saved[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  it("memoryDbSyncEnabled is false when CLAWQL_MEMORY_DB=0", async () => {
    process.env.CLAWQL_MEMORY_DB = "0";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = "/tmp/vault";
    delete process.env.CLAWQL_MEMORY_DB_SYNC_ON_RECALL;

    const flags = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* MemoryDbService;
        return {
          sync: db.memoryDbSyncEnabled(),
          recallSync: db.recallSyncDbEnabled(),
        };
      }).pipe(Effect.provide(memoryDbLiveLayer()))
    );
    expect(flags.sync).toBe(false);
    expect(flags.recallSync).toBe(false);
  });

  it("memoryDbSyncEnabled is true when vault is set and DB not disabled", async () => {
    delete process.env.CLAWQL_MEMORY_DB;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = "/tmp/vault";
    process.env.CLAWQL_MEMORY_DB_SYNC_ON_RECALL = "1";

    const flags = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* MemoryDbService;
        return {
          sync: db.memoryDbSyncEnabled(),
          recallSync: db.recallSyncDbEnabled(),
        };
      }).pipe(Effect.provide(memoryDbLiveLayer()))
    );
    expect(flags.sync).toBe(true);
    expect(flags.recallSync).toBe(true);
  });
});

describe("EmbeddingService", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    for (const key of [
      "CLAWQL_MEMORY_DB",
      "CLAWQL_OBSIDIAN_VAULT_PATH",
      "CLAWQL_VECTOR_BACKEND",
      "CLAWQL_EMBEDDING_PROVIDER",
      "CLAWQL_EMBEDDING_API_KEY",
      "OPENAI_API_KEY",
      "CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY",
    ] as const) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      const v = saved[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  it("resolveEmbeddingConfig is null when memory DB is off", async () => {
    process.env.CLAWQL_MEMORY_DB = "0";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = "/tmp/vault";

    const cfg = await Effect.runPromise(
      Effect.gen(function* () {
        return (yield* EmbeddingService).resolveEmbeddingConfig();
      }).pipe(Effect.provide(embeddingLiveLayer()))
    );
    expect(cfg).toBeNull();
  });

  it("resolveEmbeddingConfig returns local provider when vault is set", async () => {
    delete process.env.CLAWQL_MEMORY_DB;
    delete process.env.CLAWQL_EMBEDDING_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CLAWQL_EMBEDDING_PROVIDER;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = "/tmp/vault";
    process.env.CLAWQL_VECTOR_BACKEND = "sqlite";

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const embedding = yield* EmbeddingService;
        return {
          cfg: embedding.resolveEmbeddingConfig(),
          vectorRecall: embedding.vectorRecallEnabled(),
        };
      }).pipe(Effect.provide(embeddingLiveLayer()))
    );
    expect(result.cfg).toEqual(
      expect.objectContaining({ provider: "local", model: expect.any(String) })
    );
    expect(result.vectorRecall).toBe(true);
  });
});

describe("vaultConfigLiveLayer", () => {
  const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;

  afterEach(() => {
    if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
  });

  it("reads vault path from process env", async () => {
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = "/tmp/live-vault-path";
    const path = await Effect.runPromise(
      Effect.gen(function* () {
        const config = yield* VaultConfigService;
        return config.getObsidianVaultPath();
      }).pipe(Effect.provide(vaultConfigLiveLayer()))
    );
    expect(path).toBe("/tmp/live-vault-path");
  });
});
