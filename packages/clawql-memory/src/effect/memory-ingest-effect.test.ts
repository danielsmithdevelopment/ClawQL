import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { embeddingLiveLayer } from "./embedding-service.js";
import {
  executeMemoryIngestCoreEffect,
  executeMemoryIngestEffect,
} from "./memory-ingest-effect.js";
import { memoryDbLiveLayer } from "./memory-db-service.js";
import { memoryIngestLiveLayer } from "./memory-ingest-service.js";
import { memoryRecallLiveLayer } from "./memory-recall-service.js";
import { memoryServicesLiveLayer } from "./memory-effect-runtime.js";
import { MemoryIngestService } from "./memory-ingest-service.js";
import { createVaultConfigTestLayer } from "./vault-config-service.js";

describe("executeMemoryIngestCoreEffect", () => {
  let home: string;
  let prevVault: string | undefined;
  let prevMemoryDb: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-memory-ingest-native-"));
    prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    prevMemoryDb = process.env.CLAWQL_MEMORY_DB;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = home;
    process.env.CLAWQL_MEMORY_DB = "0";
  });

  afterEach(async () => {
    if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
    if (prevMemoryDb === undefined) delete process.env.CLAWQL_MEMORY_DB;
    else process.env.CLAWQL_MEMORY_DB = prevMemoryDb;
    await rm(home, { recursive: true, force: true });
  });

  it("stages prepare → vault write without nested Layer provision", async () => {
    const layer = memoryServicesLiveLayer();
    const result = await Effect.runPromise(
      executeMemoryIngestCoreEffect(home, {
        title: "Native Effect Ingest",
        insights: "staged Effect.gen pipeline",
        rebuild: { embeddings: false },
      }).pipe(Effect.provide(layer))
    );

    expect(result.ok).toBe(true);
    expect(result.path).toBe("Memory/native-effect-ingest.md");
    expect(result.rebuild?.embeddings?.synced).toBe(false);
    const body = await readFile(join(home, "Memory", "native-effect-ingest.md"), "utf8");
    expect(body).toContain("staged Effect.gen pipeline");
  });

  it("skips duplicate payloads by content hash", async () => {
    const layer = memoryServicesLiveLayer();
    const input = {
      title: "Dedup Effect",
      insights: "same section twice",
      rebuild: { embeddings: false as const },
    };
    const first = await Effect.runPromise(
      executeMemoryIngestCoreEffect(home, input).pipe(Effect.provide(layer))
    );
    const second = await Effect.runPromise(
      executeMemoryIngestCoreEffect(home, input).pipe(Effect.provide(layer))
    );

    expect(first.ok).toBe(true);
    expect(first.skipped).toBeFalsy();
    expect(second.ok).toBe(true);
    expect(second.skipped).toBe(true);
  });

  it("executeMemoryIngestEffect reports missing vault", async () => {
    const tailored = Layer.mergeAll(
      createVaultConfigTestLayer({}),
      memoryDbLiveLayer(),
      embeddingLiveLayer(),
      memoryIngestLiveLayer(),
      memoryRecallLiveLayer()
    );
    const result = await Effect.runPromise(
      executeMemoryIngestEffect({
        title: "No vault",
        insights: "should fail",
      }).pipe(Effect.provide(tailored))
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vault is not configured/i);
  });

  it("MemoryIngestService uses native Effect ingest", async () => {
    const layer = memoryServicesLiveLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const ingest = yield* MemoryIngestService;
        return yield* ingest.ingest({
          title: "Service native",
          insights: "via MemoryIngestService",
          rebuild: { embeddings: false },
          wikilinks: ["Related Note"],
        });
      }).pipe(Effect.provide(layer))
    );

    expect(result.ok).toBe(true);
    const body = await readFile(join(home, "Memory", "service-native.md"), "utf8");
    expect(body).toContain("[[Related Note]]");
  });
});
