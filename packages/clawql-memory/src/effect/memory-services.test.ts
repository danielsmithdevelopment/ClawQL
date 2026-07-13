import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryIngestService, memoryIngestLiveLayer } from "./memory-ingest-service.js";
import { MemoryRecallService, memoryRecallLiveLayer } from "./memory-recall-service.js";

describe("MemoryIngestService", () => {
  let home: string;
  let prevVault: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-memory-ingest-effect-"));
    prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = home;
  });

  afterEach(async () => {
    if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
    await rm(home, { recursive: true, force: true });
  });

  it("ingests a new vault page", async () => {
    const layer = memoryIngestLiveLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const ingest = yield* MemoryIngestService;
        return yield* ingest.ingest({
          title: "Effect ingest test",
          insights: "hello from Effect",
        });
      }).pipe(Effect.provide(layer))
    );

    expect(result.ok).toBe(true);
    expect(result.path).toBe("Memory/effect-ingest-test.md");
  });
});

describe("MemoryRecallService", () => {
  let home: string;
  let prevVault: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-memory-recall-effect-"));
    prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = home;
    await mkdir(join(home, "Memory"), { recursive: true });
    await writeFile(
      join(home, "Memory", "note.md"),
      "# Note\n\nkeyword-alpha unique-term\n",
      "utf8"
    );
  });

  afterEach(async () => {
    if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
    await rm(home, { recursive: true, force: true });
  });

  it("recalls keyword hits from the vault", async () => {
    const layer = memoryRecallLiveLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const recall = yield* MemoryRecallService;
        return yield* recall.recall({ query: "unique-term" });
      }).pipe(Effect.provide(layer))
    );

    expect(result.ok).toBe(true);
    expect(result.results?.some((r) => r.path === "Memory/note.md")).toBe(true);
  });
});
